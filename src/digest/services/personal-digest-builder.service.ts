import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../../ai-analysis/entities/article-technology-interest.entity';
import { Article, ArticleStatus } from '../../articles/entities/article.entity';
import { LoggingService } from '../../common/logging/logging.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { getLocalDateString } from '../../common/util/timezone.util';
import { RelevanceScoringService } from '../../scoring/services/relevance-scoring.service';
import { UserScoringProfileService } from '../../scoring/services/user-scoring-profile.service';
import {
  SourceCandidate,
  SourceCandidateStatus,
} from '../../sources/entities/source-candidate.entity';
import { SourceIngestionAttempt } from '../../sources/entities/source-ingestion-attempt.entity';
import { Source, SourceStatus, SourceType } from '../../sources/entities/source.entity';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { PersonalArticleLinkContext } from '../../user-actions/entities/personal-article-link.entity';
import { PermanentArticleActionType } from '../../user-actions/entities/permanent-article-action.entity';
import { PermanentArticleActionService } from '../../user-actions/services/permanent-article-action.service';
import { PersonalArticleLinkService } from '../../user-actions/services/personal-article-link.service';
import { User } from '../../users/entities/user.entity';
import {
  DigestStats,
  PersonalDigestCandidate,
  PersonalDigestConfig,
  PersonalDigestScoredCandidate,
} from '../digest.types';
import { DigestItem } from '../entities/digest-item.entity';
import { DigestStreamPage } from '../entities/digest-stream-page.entity';
import { Digest, DigestDeliveryMode, DigestStatus, DigestType } from '../entities/digest.entity';
import { AiDigestService } from './ai-digest.service';
import {
  DigestEmailItem,
  DigestEmailStreamLink,
  EmailTemplateService,
} from './email-template.service';

const CONFIG: Record<DigestType, PersonalDigestConfig> = {
  [DigestType.DAILY]: { periodHours: 24, articlesPerStream: 2, subjectSuffix: 'Daily Brief' },
  [DigestType.WEEKLY]: { periodHours: 168, articlesPerStream: 3, subjectSuffix: 'Weekly Brief' },
};

@Injectable()
export class PersonalDigestBuilderService {
  private readonly logger = new LoggingService(PersonalDigestBuilderService.name);

  constructor(
    @InjectRepository(ArticleAnalysis) private readonly analysisRepo: Repository<ArticleAnalysis>,
    @InjectRepository(ArticleStream) private readonly articleStreamRepo: Repository<ArticleStream>,
    @InjectRepository(ArticleTechnologyInterest)
    private readonly articleTechnologyInterestRepo: Repository<ArticleTechnologyInterest>,
    @InjectRepository(Article) private readonly articleRepo: Repository<Article>,
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(SourceCandidate) private readonly candidateRepo: Repository<SourceCandidate>,
    @InjectRepository(SourceIngestionAttempt)
    private readonly ingestionAttemptRepo: Repository<SourceIngestionAttempt>,
    @InjectRepository(Digest) private readonly digestRepo: Repository<Digest>,
    @InjectRepository(DigestItem) private readonly digestItemRepo: Repository<DigestItem>,
    @InjectRepository(DigestStreamPage)
    private readonly streamPageRepo: Repository<DigestStreamPage>,
    private readonly userScoringProfileService: UserScoringProfileService,
    private readonly relevanceScoringService: RelevanceScoringService,
    private readonly personalArticleLinkService: PersonalArticleLinkService,
    private readonly permanentActionService: PermanentArticleActionService,
    private readonly aiDigestService: AiDigestService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly metricsService: MetricsService,
  ) {}

  async buildForUser(
    user: User,
    type: DigestType,
    requestedPeriodKey?: string,
    delivery: {
      mode?: DigestDeliveryMode;
      triggeringAdministratorId?: string;
      actualRecipientEmail?: string;
    } = {},
  ): Promise<Digest> {
    const deliveryMode = delivery.mode ?? DigestDeliveryMode.SCHEDULED;
    const periodKey =
      requestedPeriodKey ?? `${type}:${getLocalDateString(new Date(), user.timezone!)}`;
    const existing = await this.digestRepo.findOne({ where: { userId: user.id, type, periodKey } });
    if (existing) return existing;

    const config = CONFIG[type];
    const periodEnd = new Date();
    const capStart = new Date(periodEnd.getTime() - config.periodHours * 3_600_000);
    const previous = await this.digestRepo.findOne({
      where: {
        userId: user.id,
        type,
        status: DigestStatus.SENT,
        deliveryMode: DigestDeliveryMode.SCHEDULED,
      },
      order: { sentAt: 'DESC' },
    });
    const periodStart = previous?.sentAt && previous.sentAt > capStart ? previous.sentAt : capStart;
    const candidates = await this.fetchCandidates(periodStart, periodEnd);
    const scored = (await this.scoreForUser(user.id, candidates))
      .filter((item) => item.result.eligible)
      .sort((a, b) => b.result.score - a.result.score);
    const selected = this.selectByPrimaryStream(scored, config.articlesPerStream);
    const statistics = await this.buildStatistics(periodStart, periodEnd, selected.length);

    if (selected.length === 0) {
      const skipped = await this.digestRepo.save(
        this.digestRepo.create({
          userId: user.id,
          type,
          periodKey,
          periodStart,
          periodEnd,
          subject: '',
          intro: '',
          htmlBody: '',
          textBody: '',
          status: DigestStatus.SKIPPED_EMPTY,
          deliveryMode,
          triggeringAdministratorId: delivery.triggeringAdministratorId ?? null,
          actualRecipientEmail: delivery.actualRecipientEmail ?? null,
          sentAt: null,
          buildDebug: null,
          statisticsSnapshot: statistics,
        }),
      );
      await this.metricsService.increment('digests_total', { outcome: 'skipped_empty', type });
      return skipped;
    }

    const articleIds = selected.map((item) => item.candidate.analysis.articleId);
    const context =
      type === DigestType.DAILY
        ? PersonalArticleLinkContext.DAILY_DIGEST
        : PersonalArticleLinkContext.WEEKLY_DIGEST;
    const [linkMap, actionMap] = await Promise.all([
      this.personalArticleLinkService.findOrCreateLinksBatch(user.id, articleIds, context),
      this.permanentActionService.findOrCreateBatch(user.id, articleIds),
    ]);
    const subject = `Personal Tech Radar — ${config.subjectSuffix} — ${getLocalDateString(periodEnd, user.timezone!)}`;
    const intro = await this.aiDigestService.generateIntro(
      type,
      selected.map((item) => item.candidate.analysis),
    );
    const emailItems: DigestEmailItem[] = selected.map((item, index) => {
      const analysis = item.candidate.analysis;
      const trackingUrl = `${(process.env.APP_URL ?? '').replace(/\/$/, '')}/r/${linkMap.get(analysis.articleId)}`;
      const actions = actionMap.get(analysis.articleId)!;
      return {
        position: index + 1,
        title: analysis.article.title,
        sourceName: analysis.article.source?.name ?? '',
        shortSummary: analysis.shortSummary ?? '',
        trackingUrl,
        originalUrl: analysis.article.url,
        openUrl: trackingUrl,
        usefulUrl: this.permanentActionService.buildUrl(actions[PermanentArticleActionType.USEFUL]),
        notUsefulUrl: this.permanentActionService.buildUrl(
          actions[PermanentArticleActionType.NOT_USEFUL],
        ),
        saveUrl: this.permanentActionService.buildUrl(actions[PermanentArticleActionType.SAVE]),
      };
    });
    const digest = await this.digestRepo.save(
      this.digestRepo.create({
        userId: user.id,
        type,
        periodKey,
        periodStart,
        periodEnd,
        subject,
        intro,
        htmlBody: '',
        textBody: '',
        status: DigestStatus.DRAFT,
        deliveryMode,
        triggeringAdministratorId: delivery.triggeringAdministratorId ?? null,
        actualRecipientEmail: delivery.actualRecipientEmail ?? null,
        sentAt: null,
        buildDebug: {
          requestedItemCount: config.articlesPerStream * 5,
          fallbackUsed: false,
          attempts: [
            {
              windowHours: config.periodHours,
              candidatesFound: candidates.length,
              eligibleFound: scored.length,
            },
          ],
          finalWindowHours: config.periodHours,
          finalSelectedCount: selected.length,
        },
        statisticsSnapshot: statistics,
      }),
    );

    await this.digestItemRepo.save(
      selected.map((item, index) =>
        this.digestItemRepo.create({
          digestId: digest.id,
          articleId: item.candidate.analysis.articleId,
          position: index + 1,
          scoreBreakdown: item.result.breakdown,
        }),
      ),
    );
    const streamIds = [
      ...new Set(selected.map((item) => item.candidate.analysis.mainStreamId).filter(Boolean)),
    ] as string[];
    const streamPages = await this.streamPageRepo.save(
      streamIds.map((streamId) => this.streamPageRepo.create({ digestId: digest.id, streamId })),
    );
    const streamById = new Map(
      selected
        .map((item) => item.candidate.analysis.mainStream)
        .filter((stream) => stream !== null)
        .map((stream) => [stream.id, stream]),
    );
    const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const streamLinks: DigestEmailStreamLink[] = streamPages.map((page) => ({
      name: streamById.get(page.streamId)?.name ?? page.streamId,
      url: `${appUrl}/digest-stream/${page.id}`,
    }));
    digest.htmlBody = this.emailTemplateService.renderHtml(
      subject,
      intro,
      emailItems,
      statistics,
      streamLinks,
    );
    digest.textBody = this.emailTemplateService.renderText(
      subject,
      intro,
      emailItems,
      statistics,
      streamLinks,
    );
    await this.digestRepo.save(digest);
    await this.metricsService.increment('digests_total', { outcome: 'generated', type });
    this.logger.info('Personal digest generated', {
      digestId: digest.id,
      userId: user.id,
      type,
      itemCount: selected.length,
    });
    return digest;
  }

  private fetchCandidates(periodStart: Date, periodEnd: Date): Promise<ArticleAnalysis[]> {
    return this.analysisRepo
      .createQueryBuilder('analysis')
      .innerJoinAndSelect('analysis.article', 'article')
      .innerJoinAndSelect('article.source', 'source')
      .leftJoinAndSelect('analysis.mainStream', 'mainStream')
      .where('analysis.fullAnalysisAt IS NOT NULL')
      .andWhere('analysis.preScreenIsRelevant = true')
      .andWhere('article.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('article.publishedAt >= :periodStart AND article.publishedAt < :periodEnd', {
        periodStart,
        periodEnd,
      })
      .andWhere('article.deletedAt IS NULL AND source.deletedAt IS NULL')
      .getMany();
  }

  private async scoreForUser(
    userId: string,
    analyses: ArticleAnalysis[],
  ): Promise<PersonalDigestScoredCandidate[]> {
    if (analyses.length === 0) return [];
    const articleIds = analyses.map((analysis) => analysis.articleId);
    const [streams, links, profile] = await Promise.all([
      this.articleStreamRepo.find({ where: { articleId: In(articleIds) } }),
      this.articleTechnologyInterestRepo.find({
        where: { articleId: In(articleIds) },
        relations: { technologyInterest: true },
      }),
      this.userScoringProfileService.buildProfile(
        userId,
        analyses.map((analysis) => analysis.article.sourceId),
      ),
    ]);
    return analyses.map((analysis) => {
      const articleLinks = links.filter((link) => link.articleId === analysis.articleId);
      const candidate: PersonalDigestCandidate = {
        analysis,
        technologyInterestIds: articleLinks.map((link) => link.technologyInterestId),
        technologyIds: articleLinks
          .filter((link) => link.technologyInterest.kind === TechnologyInterestKind.TECHNOLOGY)
          .map((link) => link.technologyInterestId),
        interestIds: articleLinks
          .filter((link) => link.technologyInterest.kind === TechnologyInterestKind.INTEREST)
          .map((link) => link.technologyInterestId),
        streamIds: streams
          .filter((stream) => stream.articleId === analysis.articleId)
          .map((stream) => stream.streamId),
      };
      return { candidate, result: this.relevanceScoringService.computeScore(candidate, profile) };
    });
  }

  private selectByPrimaryStream(
    scored: PersonalDigestScoredCandidate[],
    limit: number,
  ): PersonalDigestScoredCandidate[] {
    const counts = new Map<string, number>();
    const selected: PersonalDigestScoredCandidate[] = [];
    const articleIds = new Set<string>();
    for (const item of scored) {
      const streamId = item.candidate.analysis.mainStreamId;
      const articleId = item.candidate.analysis.articleId;
      if (!streamId || articleIds.has(articleId) || (counts.get(streamId) ?? 0) >= limit) continue;
      selected.push(item);
      articleIds.add(articleId);
      counts.set(streamId, (counts.get(streamId) ?? 0) + 1);
    }
    return selected;
  }

  private async buildStatistics(
    periodStart: Date,
    periodEnd: Date,
    included: number,
  ): Promise<DigestStats> {
    const sourceCountQuery = this.ingestionAttemptRepo
      .createQueryBuilder('attempt')
      .select('COUNT(DISTINCT attempt.sourceId)', 'sources')
      .where('attempt.startedAt BETWEEN :periodStart AND :periodEnd', { periodStart, periodEnd });
    const [
      sourceCount,
      publicationsProcessed,
      preAnalyzed,
      fullyAnalyzed,
      totalArticlesInDb,
      feedSourcesActive,
      webSourcesActive,
      degradedSources,
      disabledSources,
      sourceCandidatesPending,
    ] = await Promise.all([
      sourceCountQuery.getRawOne<{ sources: string }>(),
      this.articleRepo.count({ where: { contentFetchedAt: Between(periodStart, periodEnd) } }),
      this.analysisRepo.count({ where: { preScreenAt: Between(periodStart, periodEnd) } }),
      this.analysisRepo.count({ where: { fullAnalysisAt: Between(periodStart, periodEnd) } }),
      this.articleRepo.count(),
      this.sourceRepo.count({
        where: {
          status: SourceStatus.ACTIVE,
          type: In([SourceType.RSS, SourceType.ATOM, SourceType.GITHUB_RELEASE]),
        },
      }),
      this.sourceRepo.count({ where: { status: SourceStatus.ACTIVE, type: SourceType.WEB } }),
      this.sourceRepo.count({ where: { status: SourceStatus.DEGRADED } }),
      this.sourceRepo.count({ where: { status: SourceStatus.DISABLED } }),
      this.candidateRepo.count({ where: { status: SourceCandidateStatus.PENDING } }),
    ]);
    return {
      windowHours: Math.round((periodEnd.getTime() - periodStart.getTime()) / 3_600_000),
      articlesIngested: publicationsProcessed,
      articlesPassedPreanalysis: preAnalyzed,
      articlesAnalyzed: fullyAnalyzed,
      totalArticlesInDb,
      totalSourcesActive: feedSourcesActive + webSourcesActive,
      feedSourcesActive,
      webSourcesActive,
      sourceCandidatesPending,
      sourcesProcessed: Number(sourceCount?.sources ?? 0),
      publicationsProcessed,
      publicationsIncluded: included,
      degradedSources,
      disabledSources,
    };
  }
}
