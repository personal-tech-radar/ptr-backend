import { BadRequestException } from '@nestjs/common';
import { PublicFeedPreviewService } from './public-feed-preview.service';
import { RelevanceScoringService } from '../../scoring/services/relevance-scoring.service';
import { ArticleComplexityLevel } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { PreviewFeedDto } from '../dto/preview-feed.dto';

// Chainable TypeORM QueryBuilder mock — mirrors FeedQueryService's spec helper.
function buildQb(result: unknown[] = []) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['innerJoinAndSelect', 'where', 'andWhere']) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getMany = jest.fn().mockResolvedValue(result);
  return qb;
}

function makeAnalysis(
  articleId: string,
  opts: {
    publishedAt?: string;
    qualityScore?: number | null;
    complexityLevel?: ArticleComplexityLevel | null;
  } = {},
) {
  return {
    articleId,
    id: `analysis-${articleId}`,
    shortSummary: 'summary',
    qualityScore: opts.qualityScore ?? 70,
    complexityLevel: opts.complexityLevel ?? ArticleComplexityLevel.INTERMEDIATE,
    materialType: null,
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

describe('PublicFeedPreviewService', () => {
  let service: PublicFeedPreviewService;

  const mockAnalysisRepo = { createQueryBuilder: jest.fn() };
  const mockArticleStreamRepo = { find: jest.fn() };
  const mockArticleTechnologyInterestRepo = { find: jest.fn() };
  const mockContentStreamQueryService = { findByIds: jest.fn() };
  const mockTechnologyInterestQueryService = { findByIds: jest.fn() };
  const mockPublicFeedCacheService = {
    buildPreviewKey: jest.fn(),
    getPreview: jest.fn(),
    setPreview: jest.fn(),
  };

  // The real, unmocked scorer — proves the service integrates with it correctly end to end.
  const relevanceScoringService = new RelevanceScoringService();

  const streamId = 'stream-1';
  const dto: PreviewFeedDto = { technologyInterestIds: [], contentStreamIds: [streamId] };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    delete process.env.FEED_MAX_DAYS;

    mockContentStreamQueryService.findByIds.mockResolvedValue([{ id: streamId }]);
    mockTechnologyInterestQueryService.findByIds.mockResolvedValue([]);
    mockArticleStreamRepo.find.mockResolvedValue([]);
    mockArticleTechnologyInterestRepo.find.mockResolvedValue([]);
    mockPublicFeedCacheService.buildPreviewKey.mockReturnValue('cache-key');
    mockPublicFeedCacheService.getPreview.mockResolvedValue(null);

    service = new PublicFeedPreviewService(
      mockAnalysisRepo as any,
      mockArticleStreamRepo as any,
      mockArticleTechnologyInterestRepo as any,
      mockContentStreamQueryService as any,
      mockTechnologyInterestQueryService as any,
      relevanceScoringService,
      mockPublicFeedCacheService as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('taxonomy id validation', () => {
    it('throws BadRequestException for an unknown technology/interest id', async () => {
      mockTechnologyInterestQueryService.findByIds.mockResolvedValue([]);

      await expect(
        service.preview({ technologyInterestIds: ['unknown-id'], contentStreamIds: [streamId] }),
      ).rejects.toThrow(BadRequestException);
      expect(mockAnalysisRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an unknown content stream id', async () => {
      mockContentStreamQueryService.findByIds.mockResolvedValue([]);

      await expect(service.preview({ contentStreamIds: ['unknown-stream-id'] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts an empty/omitted technologyInterestIds as valid — neutral overlap, not an error', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.preview({ contentStreamIds: [streamId] })).resolves.toEqual({
        data: [],
      });
    });

    it('never resolves technology/interest or content stream ids through a create-or-reuse path', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.preview(dto);

      // Only findByIds (read-only) is exercised — no resolver/command service is injected at all,
      // so there is no create-path to accidentally call.
      expect(mockTechnologyInterestQueryService.findByIds).toHaveBeenCalledWith([]);
      expect(mockContentStreamQueryService.findByIds).toHaveBeenCalledWith([streamId]);
    });
  });

  describe('scoring integration (real RelevanceScoringService)', () => {
    it('scores a small candidate set and returns eligible items sorted by score descending', async () => {
      const matching = makeAnalysis('match-1', { qualityScore: 90 });
      const other = makeAnalysis('match-2', { qualityScore: 40 });
      const qb = buildQb([matching, other]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockArticleStreamRepo.find.mockResolvedValue([
        { articleId: 'match-1', streamId },
        { articleId: 'match-2', streamId },
      ]);

      const result = await service.preview(dto);

      expect(result.data.map((d) => d.articleId)).toEqual(['match-1', 'match-2']);
      expect(result.data[0].score).toBeGreaterThan(result.data[1].score);
      expect(result.data[0]).toHaveProperty('score');
    });

    it('excludes a candidate whose streams do not overlap contentStreamIds (eligible: false)', async () => {
      const matches = makeAnalysis('in-stream');
      const mismatched = makeAnalysis('out-of-stream');
      const qb = buildQb([matches, mismatched]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockArticleStreamRepo.find.mockResolvedValue([
        { articleId: 'in-stream', streamId },
        { articleId: 'out-of-stream', streamId: 'some-other-stream' },
      ]);

      const result = await service.preview(dto);

      expect(result.data.map((d) => d.articleId)).toEqual(['in-stream']);
    });

    it('does not hard-gate on quality score — a low-quality, stream-matching candidate is still included', async () => {
      const lowQuality = makeAnalysis('low-quality', { qualityScore: 5 });
      const qb = buildQb([lowQuality]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockArticleStreamRepo.find.mockResolvedValue([{ articleId: 'low-quality', streamId }]);

      const result = await service.preview(dto);

      expect(result.data.map((d) => d.articleId)).toEqual(['low-quality']);
      // Confirms decision #7 at the SQL level too — no qualityScore predicate on this query.
      expect(qb.andWhere.mock.calls.some(([sql]: [string]) => sql.includes('qualityScore'))).toBe(
        false,
      );
    });

    it('caps the result at the top 30 by score', async () => {
      const analyses = Array.from({ length: 40 }, (_, i) => makeAnalysis(`article-${i}`));
      const qb = buildQb(analyses);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockArticleStreamRepo.find.mockResolvedValue(
        analyses.map((a) => ({ articleId: a.articleId, streamId })),
      );

      const result = await service.preview(dto);

      expect(result.data).toHaveLength(30);
    });
  });

  describe('30-day floor', () => {
    it('floors the candidate window to FEED_MAX_DAYS (default 30) against UTC', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.preview(dto);

      const call = qb.andWhere.mock.calls.find(
        ([sql]: [string]) => sql === 'a.publishedAt >= :fromDate',
      );
      // today (2026-07-25) minus 29 days = 2026-06-26.
      expect(call[1].fromDate.toISOString()).toBe('2026-06-26T00:00:00.000Z');
    });

    it('honors a lower FEED_MAX_DAYS env override', async () => {
      process.env.FEED_MAX_DAYS = '3';
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.preview(dto);

      const call = qb.andWhere.mock.calls.find(
        ([sql]: [string]) => sql === 'a.publishedAt >= :fromDate',
      );
      // today (2026-07-25) minus 2 days = 2026-07-23.
      expect(call[1].fromDate.toISOString()).toBe('2026-07-23T00:00:00.000Z');
    });
  });

  describe('caching', () => {
    it('returns the cached response on a hit without querying candidates or repos', async () => {
      const cached = { data: [{ articleId: 'cached-1' }] };
      mockPublicFeedCacheService.getPreview.mockResolvedValue(cached);

      const result = await service.preview(dto);

      expect(result).toBe(cached);
      expect(mockAnalysisRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockArticleStreamRepo.find).not.toHaveBeenCalled();
      expect(mockArticleTechnologyInterestRepo.find).not.toHaveBeenCalled();
    });

    it('caches the computed result on a miss', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.preview(dto);

      expect(mockPublicFeedCacheService.setPreview).toHaveBeenCalledWith('cache-key', {
        data: [],
      });
    });
  });
});
