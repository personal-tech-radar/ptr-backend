import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleRelevance } from '../../ai-analysis/entities/article-relevance.entity';
import { DEFAULT_USER_ID } from '../../ai-analysis/services/ai-analysis.service';
import { Article, ArticleStatus } from '../../articles/entities/article.entity';
import { Source } from '../../sources/entities/source.entity';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { Digest, DigestStatus, DigestType } from '../entities/digest.entity';
import { DigestItem } from '../entities/digest-item.entity';
import {
  DigestBuildAttempt,
  DigestBuildConfig,
  DigestBuildDebug,
  DigestItemScoreBreakdown,
  DigestStats,
  ScoredCandidate,
} from '../digest.types';
import { AiDigestService } from './ai-digest.service';
import { DigestEmailItem, EmailTemplateService } from './email-template.service';

const DAILY_DIGEST_ARTICLES_LIMIT = Number(process.env.DAILY_DIGEST_ARTICLES_LIMIT) || 3;

const DAILY_CONFIG: DigestBuildConfig = {
  lookbackHours: 24,
  minItems: DAILY_DIGEST_ARTICLES_LIMIT,
  maxItems: DAILY_DIGEST_ARTICLES_LIMIT,
  subjectSuffix: 'Daily Brief',
  recencyFreshHours: 12,
  recencyRecentHours: 24,
  includeFlag: 'shouldIncludeInDailyDigest',
};

const WEEKLY_CONFIG: DigestBuildConfig = {
  lookbackHours: 7 * 24,
  minItems: 5,
  maxItems: 5,
  subjectSuffix: 'Weekly Brief',
  recencyFreshHours: 24,
  recencyRecentHours: 72,
  includeFlag: 'shouldIncludeInWeeklyDigest',
};

const DEEP_DIVE_WEEKLY_CONFIG: DigestBuildConfig = {
  lookbackHours: 7 * 24,
  minItems: 5,
  maxItems: 5,
  subjectSuffix: 'Deep Dive Weekly',
  recencyFreshHours: 48,
  recencyRecentHours: 96,
  includeFlag: 'shouldIncludeInDeepDiveDigest',
};

const DAILY_FALLBACK_WINDOWS = [24, 48, 72];

@Injectable()
export class DigestBuilderService {
  private readonly logger = new LoggingService(DigestBuilderService.name);

  constructor(
    @InjectRepository(Digest)
    private readonly digestRepo: Repository<Digest>,
    @InjectRepository(DigestItem)
    private readonly digestItemRepo: Repository<DigestItem>,
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    @InjectRepository(ArticleRelevance)
    private readonly relevanceRepo: Repository<ArticleRelevance>,
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
    private readonly aiDigestService: AiDigestService,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  async buildDailyDigest(): Promise<Digest | null> {
    const config = DAILY_CONFIG;
    const now = new Date();
    const attempts: DigestBuildAttempt[] = [];

    let candidates: ArticleAnalysis[] = [];
    let finalWindowHours = DAILY_FALLBACK_WINDOWS[0];

    for (const windowHours of DAILY_FALLBACK_WINDOWS) {
      const periodStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
      const candidatesFound = await this.countCandidates(periodStart, config.includeFlag);
      const eligible = await this.getEligibleCandidatesForDaily(periodStart, config.includeFlag);

      attempts.push({ windowHours, candidatesFound, eligibleFound: eligible.length });
      candidates = eligible;
      finalWindowHours = windowHours;

      if (eligible.length >= config.minItems) break;
    }

    if (candidates.length === 0) {
      this.logger.info(`No candidates for ${DigestType.DAILY} digest`);
      return null;
    }

    const scored = await this.scoreCandidates(candidates, config);
    scored.sort((a, b) => b.computedFinalScore - a.computedFinalScore);

    const selected = this.selectWithDiversification(scored, config.maxItems);
    if (selected.length === 0) return null;

    const dateStr = now.toISOString().split('T')[0];
    const subject = `Personal Tech Radar — ${config.subjectSuffix} — ${dateStr}`;
    const intro = await this.aiDigestService.generateIntro(DigestType.DAILY, selected);

    const stats = await this.gatherStats(finalWindowHours);
    const emailItems = this.toEmailItems(selected, false);
    const htmlBody = this.emailTemplateService.renderHtml(subject, intro, emailItems, stats);
    const textBody = this.emailTemplateService.renderText(subject, intro, emailItems, stats);

    const buildDebug: DigestBuildDebug = {
      requestedItemCount: config.minItems,
      fallbackUsed: attempts.length > 1 && finalWindowHours > DAILY_FALLBACK_WINDOWS[0],
      attempts,
      finalWindowHours,
      finalSelectedCount: selected.length,
    };

    const periodStart = new Date(now.getTime() - finalWindowHours * 60 * 60 * 1000);

    const digest = await this.digestRepo.save(
      this.digestRepo.create({
        type: DigestType.DAILY,
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
          articleId: selected[i].analysis.articleId,
          position: i + 1,
          scoreBreakdown: this.toScoreBreakdown(selected[i]),
        }),
      );
    }

    this.logger.info(`${DigestType.DAILY} digest built`, {
      digestId: digest.id,
      itemCount: selected.length,
      fallbackUsed: buildDebug.fallbackUsed,
      finalWindowHours,
    });

    return digest;
  }

  async buildWeeklyDigest(): Promise<Digest | null> {
    return this.buildDigest(DigestType.WEEKLY, WEEKLY_CONFIG);
  }

  async buildDeepDiveWeeklyDigest(): Promise<Digest | null> {
    return this.buildDigest(DigestType.DEEP_DIVE_WEEKLY, DEEP_DIVE_WEEKLY_CONFIG);
  }

  private async buildDigest(type: DigestType, config: DigestBuildConfig): Promise<Digest | null> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - config.lookbackHours * 60 * 60 * 1000);

    let candidates = await this.getAnalyzedCandidates(periodStart, config.includeFlag);

    if (candidates.length < config.minItems) {
      const fallback = await this.getRelaxedCandidates(periodStart);
      const existingIds = new Set(candidates.map((c) => c.articleId));
      const extra = fallback.filter((c) => !existingIds.has(c.articleId));
      candidates = [...candidates, ...extra];
    }

    if (candidates.length === 0) {
      this.logger.info(`No candidates for ${type} digest`);
      return null;
    }

    const scored = await this.scoreCandidates(candidates, config);
    scored.sort((a, b) => b.computedFinalScore - a.computedFinalScore);

    const selected = this.selectWithDiversification(scored, config.maxItems);
    if (selected.length === 0) return null;

    const dateStr = now.toISOString().split('T')[0];
    const subject = `Personal Tech Radar — ${config.subjectSuffix} — ${dateStr}`;
    const intro = await this.aiDigestService.generateIntro(type, selected);

    const stats = await this.gatherStats(config.lookbackHours);
    const emailItems = this.toEmailItems(selected, true);
    const htmlBody = this.emailTemplateService.renderHtml(subject, intro, emailItems, stats);
    const textBody = this.emailTemplateService.renderText(subject, intro, emailItems, stats);

    const digest = await this.digestRepo.save(
      this.digestRepo.create({
        type,
        periodStart,
        periodEnd: now,
        subject,
        intro,
        htmlBody,
        textBody,
        status: DigestStatus.DRAFT,
        sentAt: null,
      }),
    );

    for (let i = 0; i < selected.length; i++) {
      await this.digestItemRepo.save(
        this.digestItemRepo.create({
          digestId: digest.id,
          articleId: selected[i].analysis.articleId,
          position: i + 1,
          scoreBreakdown: this.toScoreBreakdown(selected[i]),
        }),
      );
    }

    this.logger.info(`${type} digest built`, {
      digestId: digest.id,
      itemCount: selected.length,
    });
    return digest;
  }

  computeBaseScore(analysis: ArticleAnalysis, config: DigestBuildConfig): number {
    const relevance = Number(analysis.relevanceScore);
    const quality = Number(analysis.qualityScore);
    const trust = Number(analysis.article?.source?.trustScore ?? 50);
    const recency = this.getRecencyScore(analysis.article?.publishedAt ?? null, config);
    return relevance * 0.45 + quality * 0.3 + trust * 0.15 + recency * 0.1;
  }

  computeFinalScore(
    analysis: ArticleAnalysis,
    config: DigestBuildConfig,
    feedbackAdjustment = 0,
  ): number {
    return this.computeBaseScore(analysis, config) + feedbackAdjustment;
  }

  private async scoreCandidates(
    candidates: ArticleAnalysis[],
    config: DigestBuildConfig,
  ): Promise<ScoredCandidate[]> {
    const feedbackAdjustments = await this.getFeedbackAdjustments(
      candidates.map((c) => c.article?.sourceId ?? ''),
    );

    return candidates.map((analysis) => {
      const baseScore = this.computeBaseScore(analysis, config);
      const feedbackAdjustment = feedbackAdjustments.get(analysis.article?.sourceId ?? '') ?? 0;
      return {
        analysis,
        baseScore,
        feedbackAdjustment,
        computedFinalScore: baseScore + feedbackAdjustment,
      };
    });
  }

  private async getFeedbackAdjustments(sourceIds: string[]): Promise<Map<string, number>> {
    return this.userSourcePreferenceService.getAdjustmentsForSources(DEFAULT_USER_ID, sourceIds);
  }

  private toScoreBreakdown(candidate: ScoredCandidate): DigestItemScoreBreakdown {
    return {
      baseScore: candidate.baseScore ?? candidate.computedFinalScore,
      feedbackAdjustment: candidate.feedbackAdjustment ?? 0,
      finalScore: candidate.computedFinalScore,
    };
  }

  getRecencyScore(publishedAt: Date | null, config: DigestBuildConfig): number {
    if (!publishedAt) return 50;
    const ageHours = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours <= config.recencyFreshHours) return 100;
    if (ageHours <= config.recencyRecentHours) return 80;
    return 50;
  }

  selectWithDiversification(scored: ScoredCandidate[], max: number): ScoredCandidate[] {
    const selected: ScoredCandidate[] = [];
    const sourceCount = new Map<string, number>();
    const categoryCount = new Map<string, number>();
    const skipped: ScoredCandidate[] = [];

    for (const candidate of scored) {
      if (selected.length >= max) break;
      const sourceId = candidate.analysis.article?.sourceId ?? '';
      const category = candidate.analysis.article?.source?.category ?? '';
      const src = sourceCount.get(sourceId) ?? 0;
      const cat = categoryCount.get(category) ?? 0;
      if (src >= 2) continue;
      if (cat >= 2) {
        skipped.push(candidate);
        continue;
      }
      selected.push(candidate);
      sourceCount.set(sourceId, src + 1);
      categoryCount.set(category, cat + 1);
    }

    for (const candidate of skipped) {
      if (selected.length >= max) break;
      const sourceId = candidate.analysis.article?.sourceId ?? '';
      if ((sourceCount.get(sourceId) ?? 0) >= 2) continue;
      selected.push(candidate);
      sourceCount.set(sourceId, (sourceCount.get(sourceId) ?? 0) + 1);
    }

    return selected;
  }

  private toEmailItems(
    selected: ScoredCandidate[],
    includeWhyItMatters: boolean,
  ): DigestEmailItem[] {
    return selected.map((c, i) => ({
      position: i + 1,
      title: c.analysis.article.title,
      sourceName: c.analysis.article.source?.name ?? '',
      shortSummary: c.analysis.shortSummary,
      whyItMatters: includeWhyItMatters ? c.analysis.whyItMatters : undefined,
      url: c.analysis.article.url,
      matchedInterests: c.analysis.matchedInterests,
      articleId: c.analysis.articleId,
    }));
  }

  private async gatherStats(windowHours: number): Promise<DigestStats> {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const [
      articlesIngested,
      articlesPassedPreanalysis,
      articlesAnalyzed,
      totalArticlesInDb,
      totalSourcesActive,
    ] = await Promise.all([
      this.articleRepo.count({ where: { createdAt: MoreThanOrEqual(windowStart) } }),
      this.relevanceRepo.count({
        where: { preAnalysisIsRelevant: true, createdAt: MoreThanOrEqual(windowStart) },
      }),
      this.analysisRepo.count({ where: { createdAt: MoreThanOrEqual(windowStart) } }),
      this.articleRepo.count(),
      this.sourceRepo.count({ where: { enabled: true } }),
    ]);

    return {
      windowHours,
      articlesIngested,
      articlesPassedPreanalysis,
      articlesAnalyzed,
      totalArticlesInDb,
      totalSourcesActive,
    };
  }

  private async getUsedArticleIds(): Promise<string[]> {
    const rows = await this.digestItemRepo
      .createQueryBuilder('di')
      .select('di.articleId', 'articleId')
      .innerJoin('di.digest', 'd')
      .where('d.status IN (:...statuses)', { statuses: [DigestStatus.DRAFT, DigestStatus.SENT] })
      .andWhere('d.deletedAt IS NULL')
      .andWhere('di.deletedAt IS NULL')
      .getRawMany<{ articleId: string }>();

    return rows.map((r) => r.articleId);
  }

  private async countCandidates(periodStart: Date, includeFlag: string): Promise<number> {
    return this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoin('aa.article', 'a')
      .innerJoin(
        ArticleRelevance,
        'ar',
        'ar.articleId = aa.articleId AND ar.userId = :userId AND ar.preAnalysisIsRelevant = :relevant',
        { userId: DEFAULT_USER_ID, relevant: true },
      )
      .where('aa.deletedAt IS NULL')
      .andWhere('a.deletedAt IS NULL')
      .andWhere(`aa.${includeFlag} = :flag`, { flag: true })
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :periodStart', { periodStart })
      .andWhere("a.title != ''")
      .andWhere("a.url != ''")
      .getCount();
  }

  private async getEligibleCandidatesForDaily(
    periodStart: Date,
    includeFlag: string,
  ): Promise<ArticleAnalysis[]> {
    const usedIds = await this.getUsedArticleIds();

    const qb = this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .innerJoin(
        ArticleRelevance,
        'ar',
        'ar.articleId = aa.articleId AND ar.userId = :userId AND ar.preAnalysisIsRelevant = :relevant',
        { userId: DEFAULT_USER_ID, relevant: true },
      )
      .where('aa.deletedAt IS NULL')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere(`aa.${includeFlag} = :flag`, { flag: true })
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :periodStart', { periodStart })
      .andWhere("a.title != ''")
      .andWhere("a.url != ''");

    if (usedIds.length > 0) {
      qb.andWhere('aa.articleId NOT IN (:...usedIds)', { usedIds });
    }

    return qb.getMany();
  }

  private async getAnalyzedCandidates(
    periodStart: Date,
    includeFlag: string,
  ): Promise<ArticleAnalysis[]> {
    return this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .innerJoin(
        ArticleRelevance,
        'ar',
        'ar.articleId = aa.articleId AND ar.userId = :userId AND ar.preAnalysisIsRelevant = :relevant',
        { userId: DEFAULT_USER_ID, relevant: true },
      )
      .where('aa.deletedAt IS NULL')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere(`aa.${includeFlag} = :flag`, { flag: true })
      .andWhere('aa.relevanceScore >= :minRelevance', { minRelevance: 60 })
      .andWhere('aa.qualityScore >= :minQuality', { minQuality: 50 })
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :periodStart', { periodStart })
      .andWhere("a.title != ''")
      .andWhere("a.url != ''")
      .getMany();
  }

  private async getRelaxedCandidates(periodStart: Date): Promise<ArticleAnalysis[]> {
    return this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .innerJoin(
        ArticleRelevance,
        'ar',
        'ar.articleId = aa.articleId AND ar.userId = :userId AND ar.preAnalysisIsRelevant = :relevant',
        { userId: DEFAULT_USER_ID, relevant: true },
      )
      .where('aa.deletedAt IS NULL')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere('aa.relevanceScore >= :minRelevance', { minRelevance: 40 })
      .andWhere('aa.qualityScore >= :minQuality', { minQuality: 30 })
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :periodStart', { periodStart })
      .andWhere("a.title != ''")
      .andWhere("a.url != ''")
      .orderBy('aa.relevanceScore', 'DESC')
      .getMany();
  }
}
