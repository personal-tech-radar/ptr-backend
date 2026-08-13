/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { BadRequestException } from '@nestjs/common';
import { PUBLIC_FEED_MIN_QUALITY_SCORE, PublicFeedQueryService } from './public-feed-query.service';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { QueryPublicFeedDto } from '../dto/query-public-feed.dto';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';

// Chainable TypeORM QueryBuilder mock — mirrors FeedQueryService's spec helper.
function buildQb(result: unknown[] = [], total = 0) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ]) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([result, total || result.length]);
  return qb;
}

function makeAnalysis(
  articleId: string,
  opts: { publishedAt?: string; qualityScore?: number } = {},
) {
  return {
    articleId,
    qualityScore: opts.qualityScore ?? 60,
    article: {
      id: articleId,
      sourceId: 'source-1',
      title: `Title ${articleId}`,
      url: `https://example.com/${articleId}`,
      publishedAt: new Date(opts.publishedAt ?? '2026-07-25T10:00:00.000Z'),
      status: ArticleStatus.ANALYZED,
      source: { id: 'source-1', name: 'Source' },
    },
  } as any;
}

describe('PublicFeedQueryService', () => {
  let service: PublicFeedQueryService;

  const mockAnalysisRepo = { createQueryBuilder: jest.fn() };
  const mockContentStreamQueryService = { findByKey: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PublicFeedQueryService(
      mockAnalysisRepo as any,
      mockContentStreamQueryService as any,
      {
        mapMany: jest.fn(async (rows: ArticleAnalysis[]) =>
          rows.map((row) => ({
            id: row.articleId,
            title: row.article.title,
            originalUrl: row.article.url,
            publicRedirectUrl: `/go/articles/${row.articleId}`,
            source: { id: row.article.sourceId, name: row.article.source.name },
            publishedAt: row.article.publishedAt,
          })),
        ),
      } as any,
    );
  });

  describe('default listing', () => {
    it('returns mapped items with correct pagination meta', async () => {
      const analyses = [makeAnalysis('a1'), makeAnalysis('a2')];
      const qb = buildQb(analyses, 42);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getFeed({ page: 2, limit: 20 } as QueryPublicFeedDto);

      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.orderBy).toHaveBeenCalledWith('a.publishedAt', 'DESC', 'NULLS LAST');
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(1, 'a.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(2, 'a.id', 'DESC');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        id: 'a1',
        articleId: 'a1',
        title: 'Title a1',
        originalUrl: 'https://example.com/a1',
        publicRedirectUrl: '/go/articles/a1',
        publishedAt: analyses[0].article.publishedAt,
      });
      expect(result.meta).toEqual({ total: 42, page: 2, limit: 20, totalPages: 3 });
    });

    it('never includes a score field on returned items', async () => {
      const qb = buildQb([makeAnalysis('a1')]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getFeed({} as QueryPublicFeedDto);

      expect(result.data[0]).not.toHaveProperty('score');
    });
  });

  describe('stream filter', () => {
    it('resolves a known stream key and scopes the EXISTS subquery to it', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockContentStreamQueryService.findByKey.mockResolvedValue({ id: 'stream-security' });

      await service.getFeed({ stream: ['security'] } as QueryPublicFeedDto);

      const call = qb.andWhere.mock.calls.find(([sql]: [string]) =>
        sql.includes('article_streams'),
      );
      expect(call[0]).toContain('IN (:...streamIds)');
      expect(call[1]).toEqual({ streamIds: ['stream-security'] });
    });

    it('throws BadRequestException for an unknown stream key', async () => {
      mockContentStreamQueryService.findByKey.mockResolvedValue(null);

      await expect(
        service.getFeed({ stream: ['not-a-real-stream'] } as QueryPublicFeedDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires unscoped stream membership when no stream filter is given', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getFeed({} as QueryPublicFeedDto);

      const call = qb.andWhere.mock.calls.find(([sql]: [string]) =>
        sql.includes('article_streams'),
      );
      expect(call[0]).not.toContain(':...streamIds');
    });
  });

  describe('date range filter', () => {
    it('applies dateFrom/dateTo as UTC-zoned bounds', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getFeed({
        dateFrom: '2026-07-01',
        dateTo: '2026-07-25',
      } as QueryPublicFeedDto);

      const fromCall = qb.andWhere.mock.calls.find(
        ([sql]: [string]) => sql === 'a.publishedAt >= :dateFrom',
      );
      const toCall = qb.andWhere.mock.calls.find(
        ([sql]: [string]) => sql === 'a.publishedAt < :dateTo',
      );
      expect(fromCall[1].dateFrom.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(toCall[1].dateTo.toISOString()).toBe('2026-07-26T00:00:00.000Z');
    });

    it('applies no date bound at all when dateFrom/dateTo are omitted', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getFeed({} as QueryPublicFeedDto);

      expect(qb.andWhere.mock.calls.some(([sql]: [string]) => sql.includes('publishedAt >='))).toBe(
        false,
      );
    });
  });

  describe('eligibility predicates', () => {
    it('gates on the hardcoded quality threshold', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getFeed({} as QueryPublicFeedDto);

      expect(qb.andWhere).toHaveBeenCalledWith('aa.qualityScore >= :minQuality', {
        minQuality: PUBLIC_FEED_MIN_QUALITY_SCORE,
      });
      expect(PUBLIC_FEED_MIN_QUALITY_SCORE).toBe(50);
    });

    it('requires full analysis and a successful pre-screen', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getFeed({} as QueryPublicFeedDto);

      expect(qb.andWhere).toHaveBeenCalledWith('aa.fullAnalysisAt IS NOT NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('aa.preScreenIsRelevant = true');
    });

    it('requires the article status to be analyzed', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getFeed({} as QueryPublicFeedDto);

      expect(qb.andWhere).toHaveBeenCalledWith('a.status = :status', {
        status: ArticleStatus.ANALYZED,
      });
    });
  });
});
