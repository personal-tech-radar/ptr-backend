import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../../ai-analysis/entities/article-technology-interest.entity';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { LoggingService } from '../../common/logging/logging.service';
import { RelevanceScoringService } from '../../scoring/services/relevance-scoring.service';
import { UserScoringProfileService } from '../../scoring/services/user-scoring-profile.service';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { PersonalArticleLinkContext } from '../../user-actions/entities/personal-article-link.entity';
import { PersonalArticleLinkService } from '../../user-actions/services/personal-article-link.service';
import { SaveLinkSignatureService } from '../../user-actions/services/save-link-signature.service';
import { User } from '../../users/entities/user.entity';
import { DigestItem } from '../entities/digest-item.entity';
import { Digest, DigestStatus, DigestType } from '../entities/digest.entity';
import {
  DigestBuildAttempt,
  DigestBuildDebug,
  PersonalDigestCandidate,
  PersonalDigestConfig,
  PersonalDigestScoredCandidate,
} from '../digest.types';
import { AiDigestService } from './ai-digest.service';
import { DigestEmailItem, EmailTemplateService } from './email-template.service';

const DAILY_DIGEST_ARTICLES_LIMIT = Number(process.env.DAILY_DIGEST_ARTICLES_LIMIT) || 3;
const WEEKLY_DIGEST_ARTICLES_LIMIT = Number(process.env.WEEKLY_DIGEST_ARTICLES_LIMIT) || 5;

const DAILY_CONFIG: PersonalDigestConfig = {
  fallbackWindowsHours: [24, 48, 72],
  articleLimit: DAILY_DIGEST_ARTICLES_LIMIT,
  subjectSuffix: 'Daily Brief',
};

// Weekly has no pre-existing fallback precedent to port 1:1 (the old DigestBuilderService relaxed
// score thresholds instead of widening the window for weekly) — generalized here to the same
// window-widening shape daily already uses: 7 days, then 14 days.
const WEEKLY_CONFIG: PersonalDigestConfig = {
  fallbackWindowsHours: [7 * 24, 14 * 24],
  articleLimit: WEEKLY_DIGEST_ARTICLES_LIMIT,
  subjectSuffix: 'Weekly Brief',
};

@Injectable()
export class PersonalDigestBuilderService {
  private readonly logger = new LoggingService(PersonalDigestBuilderService.name);

  constructor(
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    @InjectRepository(ArticleStream)
    private readonly articleStreamRepo: Repository<ArticleStream>,
    @InjectRepository(ArticleTechnologyInterest)
    private readonly articleTechnologyInterestRepo: Repository<ArticleTechnologyInterest>,
    @InjectRepository(Digest)
    private readonly digestRepo: Repository<Digest>,
    @InjectRepository(DigestItem)
    private readonly digestItemRepo: Repository<DigestItem>,
    private readonly userScoringProfileService: UserScoringProfileService,
    private readonly relevanceScoringService: RelevanceScoringService,
    private readonly personalArticleLinkService: PersonalArticleLinkService,
    private readonly saveLinkSignatureService: SaveLinkSignatureService,
    private readonly aiDigestService: AiDigestService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
  ) {}

  async buildForUser(user: User, type: DigestType): Promise<Digest | null> {
    const config = type === DigestType.DAILY ? DAILY_CONFIG : WEEKLY_CONFIG;
    const now = new Date();

    const usedArticleIds = await this.getUsedArticleIds(user.id);

    const attempts: DigestBuildAttempt[] = [];
    let eligible: PersonalDigestScoredCandidate[] = [];
    let finalWindowHours = config.fallbackWindowsHours[0];

    for (const windowHours of config.fallbackWindowsHours) {
      const periodStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
      const candidates = await this.fetchCandidates(periodStart, usedArticleIds);
      const scored = await this.scoreForUser(user.id, candidates);
      const scoredEligible = scored.filter((c) => c.result.eligible);

      attempts.push({
        windowHours,
        candidatesFound: candidates.length,
        eligibleFound: scoredEligible.length,
      });
      eligible = scoredEligible;
      finalWindowHours = windowHours;

      if (eligible.length >= config.articleLimit) break;
    }

    if (eligible.length === 0) {
      this.logger.info(`No candidates for personal ${type} digest`, { userId: user.id });
      return null;
    }

    eligible.sort((a, b) => b.result.score - a.result.score);
    const selected = this.selectWithDiversification(eligible, config.articleLimit);
    if (selected.length === 0) {
      this.logger.info(`No candidates survived diversification for personal ${type} digest`, {
        userId: user.id,
      });
      return null;
    }

    const selectedArticleIds = selected.map((c) => c.candidate.analysis.articleId);
    const context =
      type === DigestType.DAILY
        ? PersonalArticleLinkContext.DAILY_DIGEST
        : PersonalArticleLinkContext.WEEKLY_DIGEST;

    // Batch-created ONCE on the final selected set only, never the full candidate pool.
    const [linkMap, matchedInterestsMap] = await Promise.all([
      this.personalArticleLinkService.findOrCreateLinksBatch(user.id, selectedArticleIds, context),
      this.buildMatchedInterestsMap(selectedArticleIds),
    ]);

    const dateStr = now.toISOString().split('T')[0];
    const subject = `Personal Tech Radar — ${config.subjectSuffix} — ${dateStr}`;
    const intro = await this.aiDigestService.generateIntro(
      type,
      selected.map((c) => c.candidate.analysis),
    );

    const includeWhyItMatters = type === DigestType.WEEKLY;
    const appUrl = process.env.APP_URL ?? '';
    const emailItems = this.toEmailItems(
      selected,
      includeWhyItMatters,
      matchedInterestsMap,
      linkMap,
      user.id,
      appUrl,
    );

    // No `stats` argument — personal digests deliberately omit the ops-facing pipeline-health
    // footer (see EmailTemplateService/DigestStats), unlike the pre-MVP3 global digest emails.
    const htmlBody = this.emailTemplateService.renderHtml(subject, intro, emailItems);
    const textBody = this.emailTemplateService.renderText(subject, intro, emailItems);

    const buildDebug: DigestBuildDebug = {
      requestedItemCount: config.articleLimit,
      fallbackUsed: attempts.length > 1 && finalWindowHours > config.fallbackWindowsHours[0],
      attempts,
      finalWindowHours,
      finalSelectedCount: selected.length,
    };

    const periodStart = new Date(now.getTime() - finalWindowHours * 60 * 60 * 1000);

    const digest = await this.digestRepo.save(
      this.digestRepo.create({
        userId: user.id,
        type,
        periodStart,
        periodEnd: now,
        subject,
        intro,
        htmlBody,
        textBody,
        status: DigestStatus.DRAFT,
        sentAt: null,
        buildDebug,
      }),
    );

    for (let i = 0; i < selected.length; i++) {
      await this.digestItemRepo.save(
        this.digestItemRepo.create({
          digestId: digest.id,
          articleId: selected[i].candidate.analysis.articleId,
          position: i + 1,
          scoreBreakdown: selected[i].result.breakdown,
        }),
      );
    }

    this.logger.info(`Personal ${type} digest built`, {
      userId: user.id,
      digestId: digest.id,
      itemCount: selected.length,
      fallbackUsed: buildDebug.fallbackUsed,
      finalWindowHours,
    });

    return digest;
  }

  private async fetchCandidates(
    periodStart: Date,
    excludeArticleIds: string[],
  ): Promise<ArticleAnalysis[]> {
    const qb = this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .where('aa.deletedAt IS NULL')
      .andWhere('aa.preScreenIsRelevant = true')
      .andWhere('aa.fullAnalysisAt IS NOT NULL')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :periodStart', { periodStart })
      .andWhere("a.title != ''")
      .andWhere("a.url != ''");

    if (excludeArticleIds.length > 0) {
      qb.andWhere('aa.articleId NOT IN (:...excludeIds)', { excludeIds: excludeArticleIds });
    }

    return qb.getMany();
  }

  // Excludes articles already sent to THIS user in a previous digest (draft or sent) — scoped by
  // the real Digest.userId FK, unlike the old global DigestBuilderService.getUsedArticleIds.
  private async getUsedArticleIds(userId: string): Promise<string[]> {
    const rows = await this.digestItemRepo
      .createQueryBuilder('di')
      .select('di.articleId', 'articleId')
      .innerJoin('di.digest', 'd')
      .where('d.userId = :userId', { userId })
      .andWhere('d.status IN (:...statuses)', { statuses: [DigestStatus.DRAFT, DigestStatus.SENT] })
      .andWhere('d.deletedAt IS NULL')
      .andWhere('di.deletedAt IS NULL')
      .getRawMany<{ articleId: string }>();

    return rows.map((r) => r.articleId);
  }

  // Scores every candidate through the exact same engine as Feed/Public Preview
  // (RelevanceScoringService + UserScoringProfileService). Content-stream mismatch is the only
  // hard exclusion — see RelevanceScoringService.computeScore.
  private async scoreForUser(
    userId: string,
    candidates: ArticleAnalysis[],
  ): Promise<PersonalDigestScoredCandidate[]> {
    if (candidates.length === 0) return [];

    const articleIds = candidates.map((c) => c.articleId);
    const sourceIds = [...new Set(candidates.map((c) => c.article.sourceId))];

    const [{ streamIdsByArticle, technologyInterestIdsByArticle }, profile] = await Promise.all([
      this.buildScorableMaps(articleIds),
      this.userScoringProfileService.buildProfile(userId, sourceIds, articleIds),
    ]);

    return candidates.map((analysis) => {
      const candidate: PersonalDigestCandidate = {
        analysis,
        technologyInterestIds: technologyInterestIdsByArticle.get(analysis.articleId) ?? [],
        streamIds: streamIdsByArticle.get(analysis.articleId) ?? [],
      };
      return { candidate, result: this.relevanceScoringService.computeScore(candidate, profile) };
    });
  }

  // Batched, two-query lookup (streams + technology/interests) rather than N+1 per candidate —
  // mirrors FeedQueryService.buildScorableMaps' pattern.
  private async buildScorableMaps(articleIds: string[]): Promise<{
    streamIdsByArticle: Map<string, string[]>;
    technologyInterestIdsByArticle: Map<string, string[]>;
  }> {
    const [streams, technologyInterests] = await Promise.all([
      this.articleStreamRepo.find({ where: { articleId: In(articleIds) } }),
      this.articleTechnologyInterestRepo.find({ where: { articleId: In(articleIds) } }),
    ]);

    const streamIdsByArticle = new Map<string, string[]>();
    for (const s of streams) {
      const list = streamIdsByArticle.get(s.articleId) ?? [];
      list.push(s.streamId);
      streamIdsByArticle.set(s.articleId, list);
    }

    const technologyInterestIdsByArticle = new Map<string, string[]>();
    for (const t of technologyInterests) {
      const list = technologyInterestIdsByArticle.get(t.articleId) ?? [];
      list.push(t.technologyInterestId);
      technologyInterestIdsByArticle.set(t.articleId, list);
    }

    return { streamIdsByArticle, technologyInterestIdsByArticle };
  }

  // Pure post-scoring selection algorithm ported unchanged from the old global
  // DigestBuilderService.selectWithDiversification — max 2 per source, preferably max 2 per
  // category, backfilling from the skipped-for-category pool if the cap isn't reached otherwise.
  private selectWithDiversification(
    scored: PersonalDigestScoredCandidate[],
    max: number,
  ): PersonalDigestScoredCandidate[] {
    const selected: PersonalDigestScoredCandidate[] = [];
    const sourceCount = new Map<string, number>();
    const categoryCount = new Map<string, number>();
    const skipped: PersonalDigestScoredCandidate[] = [];

    for (const item of scored) {
      if (selected.length >= max) break;
      const sourceId = item.candidate.analysis.article?.sourceId ?? '';
      const category = item.candidate.analysis.article?.source?.category ?? '';
      const src = sourceCount.get(sourceId) ?? 0;
      const cat = categoryCount.get(category) ?? 0;
      if (src >= 2) continue;
      if (cat >= 2) {
        skipped.push(item);
        continue;
      }
      selected.push(item);
      sourceCount.set(sourceId, src + 1);
      categoryCount.set(category, cat + 1);
    }

    for (const item of skipped) {
      if (selected.length >= max) break;
      const sourceId = item.candidate.analysis.article?.sourceId ?? '';
      if ((sourceCount.get(sourceId) ?? 0) >= 2) continue;
      selected.push(item);
      sourceCount.set(sourceId, (sourceCount.get(sourceId) ?? 0) + 1);
    }

    return selected;
  }

  private toEmailItems(
    selected: PersonalDigestScoredCandidate[],
    includeWhyItMatters: boolean,
    matchedInterestsMap: Map<string, string[]>,
    linkMap: Map<string, string>,
    userId: string,
    appUrl: string,
  ): DigestEmailItem[] {
    return selected.map((c, i) => {
      const { analysis } = c.candidate;
      const linkId = linkMap.get(analysis.articleId);
      return {
        position: i + 1,
        title: analysis.article.title,
        sourceName: analysis.article.source?.name ?? '',
        shortSummary: analysis.shortSummary ?? '',
        whyItMatters: includeWhyItMatters ? (analysis.whyItMatters ?? undefined) : undefined,
        url: linkId ? `${appUrl}/go/${linkId}` : analysis.article.url,
        matchedInterests: matchedInterestsMap.get(analysis.articleId) ?? [],
        saveUrl: this.saveLinkSignatureService.buildSaveFromEmailUrl(userId, analysis.articleId),
        // articleId intentionally omitted: personal digests deliberately drop the 👍/👎 feedback
        // buttons (MVP3 Phase 10 decision #4). The feedback-button markup itself was removed
        // entirely from EmailTemplateService rather than left as a dead no-op path.
      };
    });
  }

  // Batched, two-step lookup (link rows -> names) rather than N+1 per selected article — ported
  // from the old DigestBuilderService.buildMatchedInterestsMap. Only called with the small set of
  // articles actually selected for a single digest send.
  private async buildMatchedInterestsMap(articleIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (articleIds.length === 0) return map;

    const links = await this.articleTechnologyInterestRepo.find({
      where: { articleId: In(articleIds) },
    });
    if (links.length === 0) return map;

    const technologyInterestIds = Array.from(new Set(links.map((l) => l.technologyInterestId)));
    const technologyInterests =
      await this.technologyInterestQueryService.findByIds(technologyInterestIds);
    const nameById = new Map(technologyInterests.map((ti) => [ti.id, ti.name]));

    for (const link of links) {
      const name = nameById.get(link.technologyInterestId);
      if (!name) continue;
      const names = map.get(link.articleId) ?? [];
      names.push(name);
      map.set(link.articleId, names);
    }
    return map;
  }
}
