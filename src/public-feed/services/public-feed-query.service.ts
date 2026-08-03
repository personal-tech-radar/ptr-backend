import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { PublicArticlesService } from '../../articles/services/public-articles.service';
import { LoggingService } from '../../common/logging/logging.service';
import { zonedEndOfDayExclusiveUTC, zonedStartOfDayUTC } from '../../common/util/timezone.util';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { PublicFeedResponseDto } from '../dto/public-feed-response.dto';
import { QueryPublicFeedDto } from '../dto/query-public-feed.dto';

// Hardcoded, not env-configurable — mirrors DigestBuilderService.getAnalyzedCandidates' primary-
// tier `qualityScore >= 50` precedent. Applies to the public feed's eligibility gate only —
// PublicFeedPreviewService deliberately has no such hard gate.
export const PUBLIC_FEED_MIN_QUALITY_SCORE = 50;

@Injectable()
export class PublicFeedQueryService {
  private readonly logger = new LoggingService(PublicFeedQueryService.name);

  constructor(
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly publicArticlesService: PublicArticlesService,
  ) {}

  // No day-grouping, no scoring — flat, paginated, strictly publishedAt DESC. No 30-day freshness
  // floor unless the caller explicitly provides dateFrom.
  async getFeed(query: QueryPublicFeedDto): Promise<PublicFeedResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const streamIds = await this.resolveStreamFilter(query.stream);

    const qb = this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .where('aa.deletedAt IS NULL')
      .andWhere('aa.fullAnalysisAt IS NOT NULL')
      .andWhere('aa.preScreenIsRelevant = true')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('aa.qualityScore >= :minQuality', { minQuality: PUBLIC_FEED_MIN_QUALITY_SCORE });

    // EXISTS subquery against article_streams — requires at least one stream membership row,
    // optionally restricted to the requested stream ids. A candidate the analysis pipeline never
    // tagged to any stream is excluded either way.
    if (streamIds.length > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM article_streams ars WHERE ars."articleId" = aa."articleId" ` +
          `AND ars."streamId" IN (:...streamIds))`,
        { streamIds },
      );
    } else {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM article_streams ars WHERE ars."articleId" = aa."articleId")`,
      );
    }

    if (query.dateFrom) {
      qb.andWhere('a.publishedAt >= :dateFrom', {
        dateFrom: zonedStartOfDayUTC(query.dateFrom, 'UTC'),
      });
    }
    if (query.dateTo) {
      qb.andWhere('a.publishedAt < :dateTo', {
        dateTo: zonedEndOfDayExclusiveUTC(query.dateTo, 'UTC'),
      });
    }

    const [analyses, total] = await qb
      .orderBy('a.publishedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    this.logger.info('Public feed listed', {
      page,
      limit,
      total,
      streamFilterCount: streamIds.length,
    });

    const publicArticles = await this.publicArticlesService.mapMany(analyses);
    return {
      data: publicArticles.map((article) => ({ ...article, articleId: article.id })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async resolveStreamFilter(streamKeys?: string[]): Promise<string[]> {
    if (!streamKeys || streamKeys.length === 0) return [];
    const uniqueKeys = [...new Set(streamKeys)];
    const resolved = await Promise.all(
      uniqueKeys.map((key) => this.contentStreamQueryService.findByKey(key)),
    );
    const missing = uniqueKeys.filter((_, i) => !resolved[i]);
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown content stream key(s): ${missing.join(', ')}`);
    }
    return resolved.map((cs) => (cs as ContentStream).id);
  }
}
