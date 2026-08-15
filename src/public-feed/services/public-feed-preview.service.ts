import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../../ai-analysis/entities/article-technology-interest.entity';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { LoggingService } from '../../common/logging/logging.service';
import {
  addDaysToDateString,
  getLocalDateString,
  zonedEndOfDayExclusiveUTC,
  zonedStartOfDayUTC,
} from '../../common/util/timezone.util';
import { RelevanceScoringService } from '../../scoring/services/relevance-scoring.service';
import { ScorableArticle, ScoringProfile } from '../../scoring/scoring.types';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { PreviewFeedArticleItemDto } from '../dto/preview-feed-article-item.dto';
import { PreviewFeedDto } from '../dto/preview-feed.dto';
import { PreviewFeedResponseDto } from '../dto/preview-feed-response.dto';
import { PublicFeedStatisticsService } from './public-feed-statistics.service';
import { PublicFeedCacheService } from './public-feed-cache.service';

const DEFAULT_MAX_DAYS = 30;
const PREVIEW_RESULT_LIMIT = 30;

@Injectable()
export class PublicFeedPreviewService {
  private readonly logger = new LoggingService(PublicFeedPreviewService.name);

  constructor(
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    @InjectRepository(ArticleStream)
    private readonly articleStreamRepo: Repository<ArticleStream>,
    @InjectRepository(ArticleTechnologyInterest)
    private readonly articleTechnologyInterestRepo: Repository<ArticleTechnologyInterest>,
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly relevanceScoringService: RelevanceScoringService,
    private readonly publicFeedCacheService: PublicFeedCacheService,
    private readonly publicFeedStatisticsService: PublicFeedStatisticsService,
  ) {}

  async preview(dto: PreviewFeedDto): Promise<PreviewFeedResponseDto> {
    const technologyInterestIds = dto.technologyInterestIds ?? [];
    await this.validateTaxonomyIds(technologyInterestIds, dto.contentStreamIds);

    const cacheKey = await this.publicFeedCacheService.buildVersionedPreviewKey(
      technologyInterestIds,
      dto.contentStreamIds,
      dto.dateFrom,
      dto.dateTo,
    );
    const cached = await this.publicFeedCacheService.getPreview(cacheKey);
    if (cached) {
      return {
        ...cached,
        meta: await this.publicFeedStatisticsService.get(cached.data.length),
      };
    }

    const candidates = await this.fetchCandidates(dto);
    const data = await this.scoreCandidates(
      candidates,
      technologyInterestIds,
      dto.contentStreamIds,
    );
    const result: PreviewFeedResponseDto = {
      data,
      meta: await this.publicFeedStatisticsService.get(data.length),
    };

    await this.publicFeedCacheService.setPreview(cacheKey, result);

    this.logger.info('Public feed preview computed', {
      candidateCount: candidates.length,
      resultCount: data.length,
    });

    return result;
  }

  // Mirrors OnboardingService's "unknown id -> BadRequestException" validation pattern. Never
  // resolves via TechnologyInterestResolverService/TechnologyInterestCommandService's
  // create-or-reuse path — this endpoint only ever reads the existing catalog.
  private async validateTaxonomyIds(
    technologyInterestIds: string[],
    contentStreamIds: string[],
  ): Promise<void> {
    const [foundTechnologyInterests, foundContentStreams] = await Promise.all([
      this.technologyInterestQueryService.findByIds(technologyInterestIds),
      this.contentStreamQueryService.findByIds(contentStreamIds),
    ]);

    const foundTechnologyInterestIds = new Set(foundTechnologyInterests.map((ti) => ti.id));
    const missingTechnologyInterestIds = technologyInterestIds.filter(
      (id) => !foundTechnologyInterestIds.has(id),
    );
    if (missingTechnologyInterestIds.length > 0) {
      throw new BadRequestException(
        `Unknown technology/interest id(s): ${missingTechnologyInterestIds.join(', ')}`,
      );
    }

    const foundContentStreamIds = new Set(foundContentStreams.map((cs) => cs.id));
    const missingContentStreamIds = contentStreamIds.filter((id) => !foundContentStreamIds.has(id));
    if (missingContentStreamIds.length > 0) {
      throw new BadRequestException(
        `Unknown content stream id(s): ${missingContentStreamIds.join(', ')}`,
      );
    }
  }

  // Same "successfully analyzed" candidate predicate as FeedQueryService's non-saved path, floored
  // to FEED_MAX_DAYS (default 30) against a fixed 'UTC' zone — there's no per-request timezone for
  // an anonymous caller. Deliberately NO qualityScore gate here — quality is already a scoring
  // input inside RelevanceScoringService.computeScore's formula.
  private async fetchCandidates(dto: PreviewFeedDto): Promise<ArticleAnalysis[]> {
    const maxDays = Number(process.env.FEED_MAX_DAYS) || DEFAULT_MAX_DAYS;
    const todayStr = getLocalDateString(new Date(), 'UTC');
    const floorDateStr = addDaysToDateString(todayStr, -(maxDays - 1));
    const fromDateInclusive = zonedStartOfDayUTC(floorDateStr, 'UTC');

    return this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .where('aa.deletedAt IS NULL')
      .andWhere('aa.fullAnalysisAt IS NOT NULL')
      .andWhere('aa.preScreenIsRelevant = true')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :fromDate', {
        fromDate: dto.dateFrom ? zonedStartOfDayUTC(dto.dateFrom, 'UTC') : fromDateInclusive,
      })
      .andWhere(dto.dateTo ? 'a.publishedAt < :toDate' : '1=1', {
        toDate: dto.dateTo ? zonedEndOfDayExclusiveUTC(dto.dateTo, 'UTC') : undefined,
      })
      .getMany();
  }

  // Flat, top-30-by-score list — deliberately not FeedQueryService's per-stream round-robin
  // distribution/capping algorithm.
  private async scoreCandidates(
    analyses: ArticleAnalysis[],
    technologyInterestIds: string[],
    contentStreamIds: string[],
  ): Promise<PreviewFeedArticleItemDto[]> {
    if (analyses.length === 0) return [];

    const articleIds = analyses.map((a) => a.articleId);
    const {
      streamIdsByArticle,
      technologyInterestIdsByArticle,
      technologyIdsByArticle,
      interestIdsByArticle,
    } = await this.buildScorableMaps(articleIds);

    const selected = await this.technologyInterestQueryService.findByIds(technologyInterestIds);
    const profile: ScoringProfile = {
      technologyInterestIds,
      technologyIds: selected
        .filter((item) => item.kind === TechnologyInterestKind.TECHNOLOGY)
        .map((item) => item.id),
      interestIds: selected
        .filter((item) => item.kind === TechnologyInterestKind.INTEREST)
        .map((item) => item.id),
      contentStreamIds,
      level: null,
    };

    return analyses
      .map((analysis) => {
        const scorable: ScorableArticle = {
          analysis,
          technologyInterestIds: technologyInterestIdsByArticle.get(analysis.articleId) ?? [],
          technologyIds: technologyIdsByArticle.get(analysis.articleId) ?? [],
          interestIds: interestIdsByArticle.get(analysis.articleId) ?? [],
          streamIds: streamIdsByArticle.get(analysis.articleId) ?? [],
        };
        return {
          analysis,
          result: this.relevanceScoringService.computeScore(scorable, profile),
        };
      })
      .filter((item) => item.result.eligible)
      .sort((a, b) => b.result.score - a.result.score)
      .slice(0, PREVIEW_RESULT_LIMIT)
      .map((item) => this.toItemDto(item.analysis, item.result.score));
  }

  // Same batched, two-query lookup pattern as FeedQueryService.buildScorableMaps — O(1) DB round
  // trips regardless of candidate count, not N+1.
  private async buildScorableMaps(articleIds: string[]): Promise<{
    streamIdsByArticle: Map<string, string[]>;
    technologyInterestIdsByArticle: Map<string, string[]>;
    technologyIdsByArticle: Map<string, string[]>;
    interestIdsByArticle: Map<string, string[]>;
  }> {
    const [streams, technologyInterests] = await Promise.all([
      this.articleStreamRepo.find({ where: { articleId: In(articleIds) } }),
      this.articleTechnologyInterestRepo.find({
        where: { articleId: In(articleIds) },
        relations: { technologyInterest: true },
      }),
    ]);

    const streamIdsByArticle = new Map<string, string[]>();
    for (const s of streams) {
      const list = streamIdsByArticle.get(s.articleId) ?? [];
      list.push(s.streamId);
      streamIdsByArticle.set(s.articleId, list);
    }

    const technologyInterestIdsByArticle = new Map<string, string[]>();
    const technologyIdsByArticle = new Map<string, string[]>();
    const interestIdsByArticle = new Map<string, string[]>();
    for (const t of technologyInterests) {
      const list = technologyInterestIdsByArticle.get(t.articleId) ?? [];
      list.push(t.technologyInterestId);
      technologyInterestIdsByArticle.set(t.articleId, list);
      const target =
        t.technologyInterest.kind === TechnologyInterestKind.TECHNOLOGY
          ? technologyIdsByArticle
          : interestIdsByArticle;
      target.set(t.articleId, [...(target.get(t.articleId) ?? []), t.technologyInterestId]);
    }

    return {
      streamIdsByArticle,
      technologyInterestIdsByArticle,
      technologyIdsByArticle,
      interestIdsByArticle,
    };
  }

  private toItemDto(analysis: ArticleAnalysis, score: number): PreviewFeedArticleItemDto {
    return {
      articleId: analysis.articleId,
      title: analysis.article.title,
      url: analysis.article.url,
      sourceName: analysis.article.source?.name ?? '',
      publishedAt: analysis.article.publishedAt as Date,
      shortSummary: analysis.shortSummary ?? '',
      complexityLevel: analysis.complexityLevel,
      materialType: analysis.materialType,
      score,
    };
  }
}
