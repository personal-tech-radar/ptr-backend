import { BadRequestException } from '@nestjs/common';
import { FeedQueryService } from './feed-query.service';
import {
  ArticleComplexityLevel,
  ArticleMaterialType,
} from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { PersonalArticleLinkContext } from '../../user-actions/entities/personal-article-link.entity';
import { QueryFeedDto } from '../dto/query-feed.dto';

// Chainable TypeORM QueryBuilder mock — every method returns `this`, `getMany` resolves to
// whatever the test configures.
function buildQb(result: unknown[] = []) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['innerJoinAndSelect', 'innerJoin', 'where', 'andWhere', 'orderBy']) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getMany = jest.fn().mockResolvedValue(result);
  return qb;
}

function makeAnalysis(
  articleId: string,
  opts: {
    publishedAt: string;
    sourceId?: string;
    sourceName?: string;
    title?: string;
    url?: string;
    shortSummary?: string;
  } = { publishedAt: '2026-07-25T10:00:00.000Z' },
) {
  const sourceId = opts.sourceId ?? 'source-1';
  return {
    articleId,
    id: `analysis-${articleId}`,
    shortSummary: opts.shortSummary ?? 'summary',
    complexityLevel: ArticleComplexityLevel.INTERMEDIATE,
    materialType: ArticleMaterialType.ARTICLE,
    article: {
      id: articleId,
      sourceId,
      title: opts.title ?? `Title ${articleId}`,
      url: opts.url ?? `https://example.com/${articleId}`,
      publishedAt: new Date(opts.publishedAt),
      status: ArticleStatus.ANALYZED,
      source: { id: sourceId, name: opts.sourceName ?? 'Source' },
    },
  } as any;
}

describe('FeedQueryService', () => {
  let service: FeedQueryService;

  const userId = 'user-1';
  const user = { id: userId, timezone: 'UTC', level: 'junior' };

  const mockAnalysisRepo = { createQueryBuilder: jest.fn() };
  const mockArticleStreamRepo = { find: jest.fn() };
  const mockArticleTechnologyInterestRepo = { find: jest.fn() };
  const mockSourceRepo = { find: jest.fn() };
  const mockSavedArticleRepo = { createQueryBuilder: jest.fn() };
  const mockContentStreamQueryService = { findByKey: jest.fn(), findSelectedByUser: jest.fn() };
  const mockTechnologyInterestQueryService = { findByIds: jest.fn() };
  const mockUserQueryService = { findById: jest.fn() };
  const mockUserScoringProfileService = { buildProfile: jest.fn() };
  const mockRelevanceScoringService = { computeScore: jest.fn() };
  const mockPersonalArticleLinkService = { findOrCreateLinksBatch: jest.fn() };

  // Deterministic score lookup, overridden per test via `scores`.
  let scores: Record<string, { score: number; eligible: boolean }>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00.000Z'));

    scores = {};
    mockUserQueryService.findById.mockResolvedValue(user);
    mockUserScoringProfileService.buildProfile.mockResolvedValue({
      technologyInterestIds: [],
      contentStreamIds: [],
      level: null,
    });
    mockRelevanceScoringService.computeScore.mockImplementation((candidate: any) => {
      const entry = scores[candidate.analysis.articleId] ?? { score: 50, eligible: true };
      return { eligible: entry.eligible, score: entry.score, breakdown: {} as any };
    });
    mockArticleStreamRepo.find.mockResolvedValue([]);
    mockArticleTechnologyInterestRepo.find.mockResolvedValue([]);
    mockPersonalArticleLinkService.findOrCreateLinksBatch.mockImplementation(
      (_userId: string, articleIds: string[]) =>
        Promise.resolve(new Map(articleIds.map((id) => [id, `link-${id}`]))),
    );
    mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([]);
    delete process.env.FEED_MAX_DAYS;

    service = new FeedQueryService(
      mockAnalysisRepo as any,
      mockArticleStreamRepo as any,
      mockArticleTechnologyInterestRepo as any,
      mockSourceRepo as any,
      mockSavedArticleRepo as any,
      mockContentStreamQueryService as any,
      mockTechnologyInterestQueryService as any,
      mockUserQueryService as any,
      mockUserScoringProfileService as any,
      mockRelevanceScoringService as any,
      mockPersonalArticleLinkService as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('filter validation', () => {
    it('rejects saved=true combined with a topical filter without looking up the user', async () => {
      const query: QueryFeedDto = { saved: true, stream: ['security'] } as QueryFeedDto;

      await expect(service.getFeed(userId, query)).rejects.toThrow(BadRequestException);
      expect(mockUserQueryService.findById).not.toHaveBeenCalled();
    });

    it('rejects an unknown content stream key', async () => {
      mockContentStreamQueryService.findByKey.mockResolvedValue(null);

      await expect(
        service.getFeed(userId, { stream: ['not-a-real-stream'] } as QueryFeedDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown technology/interest id', async () => {
      mockTechnologyInterestQueryService.findByIds.mockResolvedValue([]);

      await expect(
        service.getFeed(userId, { technology: ['unknown-id'] } as QueryFeedDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown source id', async () => {
      mockSourceRepo.find.mockResolvedValue([]);

      await expect(
        service.getFeed(userId, { source: ['unknown-id'] } as QueryFeedDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('30-day floor', () => {
    it('clamps the non-saved candidate window to the floor when the requested range is older', async () => {
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getFeed(userId, { beforeDate: '2026-05-01', days: 5 } as QueryFeedDto);

      // today (2026-07-25) minus 29 days = 2026-06-26, the permanent floor — well after the
      // naive requested range start (2026-04-27), so the floor wins.
      const [, params] = qb.andWhere.mock.calls.find(
        ([sql]: [string]) => sql === 'a.publishedAt >= :fromDate',
      );
      expect(params.fromDate.toISOString()).toBe('2026-06-26T00:00:00.000Z');
    });

    it('does not apply the 30-day floor to the saved=true path', async () => {
      const savedQb = buildQb([]);
      mockSavedArticleRepo.createQueryBuilder.mockReturnValue(savedQb);

      await service.getFeed(userId, {
        saved: true,
        beforeDate: '2026-05-01',
        days: 5,
      } as QueryFeedDto);

      const [, params] = savedQb.andWhere.mock.calls.find(
        ([sql]: [string]) => sql === 'a.publishedAt >= :fromDate',
      );
      // Unclamped: 2026-05-01 minus 4 days = 2026-04-27.
      expect(params.fromDate.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });

    it('honors a lower FEED_MAX_DAYS env override for both the requested days and the floor', async () => {
      process.env.FEED_MAX_DAYS = '3';
      const qb = buildQb([]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getFeed(userId, {
        beforeDate: '2026-07-25',
        days: 10,
      } as QueryFeedDto);

      expect(result.days).toHaveLength(3);
    });
  });

  describe('day grouping across timezones', () => {
    it('groups an article into the previous local calendar day for a negative-offset timezone', async () => {
      const nyUser = { ...user, timezone: 'America/New_York' };
      mockUserQueryService.findById.mockResolvedValue(nyUser);

      // 2026-07-25T02:00:00Z is 2026-07-24T22:00 local in America/New_York (UTC-4 in July).
      const analysis = makeAnalysis('article-1', { publishedAt: '2026-07-25T02:00:00.000Z' });
      const qb = buildQb([analysis]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      scores['article-1'] = { score: 90, eligible: true };

      const result = await service.getFeed(userId, {
        beforeDate: '2026-07-25',
        days: 2,
      } as QueryFeedDto);

      const day24 = result.days.find((d) => d.date === '2026-07-24');
      const day25 = result.days.find((d) => d.date === '2026-07-25');
      expect(day24?.articles.map((a) => a.articleId)).toEqual(['article-1']);
      expect(day25?.articles).toEqual([]);
    });
  });

  describe('per-stream and per-day caps', () => {
    it('caps a single-stream-filter result at the top 50 by score, without the 100-cap layer', async () => {
      const analyses = Array.from({ length: 60 }, (_, i) => makeAnalysis(`article-${i}`));
      analyses.forEach((_, i) => {
        scores[`article-${i}`] = { score: i, eligible: true };
      });
      const qb = buildQb(analyses);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockContentStreamQueryService.findByKey.mockResolvedValue({ id: 'stream-security' });
      mockArticleStreamRepo.find.mockResolvedValue(
        analyses.map((a) => ({ articleId: a.articleId, streamId: 'stream-security' })),
      );

      const result = await service.getFeed(userId, {
        stream: ['security'],
        beforeDate: '2026-07-25',
        days: 1,
      } as QueryFeedDto);

      expect(result.days[0].articles).toHaveLength(50);
      // Highest scores (59 down to 10) win; sorted score-descending in the response.
      expect(result.days[0].articles[0].articleId).toBe('article-59');
      expect(result.days[0].articles.map((a) => a.score)).toEqual(
        [...Array(50)].map((_, i) => 59 - i),
      );
    });

    it("caps distribution across the user's selected streams at 100 per day", async () => {
      const streamA = { id: 'stream-a', sortOrder: 1 };
      const streamB = { id: 'stream-b', sortOrder: 2 };
      mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([streamA, streamB]);

      const aArticles = Array.from({ length: 60 }, (_, i) => `a-${i}`);
      const bArticles = Array.from({ length: 60 }, (_, i) => `b-${i}`);
      const analyses = [...aArticles, ...bArticles].map((id) => makeAnalysis(id));
      [...aArticles, ...bArticles].forEach((id, i) => {
        scores[id] = { score: i, eligible: true };
      });

      const qb = buildQb(analyses);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockArticleStreamRepo.find.mockResolvedValue([
        ...aArticles.map((id) => ({ articleId: id, streamId: 'stream-a' })),
        ...bArticles.map((id) => ({ articleId: id, streamId: 'stream-b' })),
      ]);

      const result = await service.getFeed(userId, {
        beforeDate: '2026-07-25',
        days: 1,
      } as QueryFeedDto);

      expect(result.days[0].articles).toHaveLength(100);
    });
  });

  describe('round-robin distribution', () => {
    it('merges deterministically in stream sortOrder, alternating highest-remaining-score per stream', async () => {
      const streamA = { id: 'stream-a', sortOrder: 1 };
      const streamB = { id: 'stream-b', sortOrder: 2 };
      mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([streamB, streamA]); // out of order on purpose

      const analyses = [
        makeAnalysis('a1'),
        makeAnalysis('a2'),
        makeAnalysis('b1'),
        makeAnalysis('b2'),
      ];
      scores.a1 = { score: 100, eligible: true };
      scores.a2 = { score: 80, eligible: true };
      scores.b1 = { score: 90, eligible: true };
      scores.b2 = { score: 70, eligible: true };

      const qb = buildQb(analyses);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockArticleStreamRepo.find.mockResolvedValue([
        { articleId: 'a1', streamId: 'stream-a' },
        { articleId: 'a2', streamId: 'stream-a' },
        { articleId: 'b1', streamId: 'stream-b' },
        { articleId: 'b2', streamId: 'stream-b' },
      ]);

      const result = await service.getFeed(userId, {
        beforeDate: '2026-07-25',
        days: 1,
      } as QueryFeedDto);

      // Membership is round-robin (a1, b1, a2, b2 in queue order), but the final day list is
      // re-sorted by score descending for display.
      expect(result.days[0].articles.map((a) => a.articleId)).toEqual(['a1', 'b1', 'a2', 'b2']);
    });

    it('dedups an article matching two streams and backfills the freed slot from the highest-scored leftover', async () => {
      const streamA = { id: 'stream-a', sortOrder: 1 };
      const streamB = { id: 'stream-b', sortOrder: 2 };
      mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([streamA, streamB]);

      // `shared` matches both streams and is each stream's top-scored item, so it's popped first
      // by both queues in round 1 — the second occurrence must be deduped, and the freed slot
      // backfilled from the next-highest-scored leftover across both streams (b2, score 85).
      const analyses = [
        makeAnalysis('shared'),
        makeAnalysis('a2'),
        makeAnalysis('b2'),
        makeAnalysis('b3'),
      ];
      scores.shared = { score: 100, eligible: true };
      scores.a2 = { score: 60, eligible: true };
      scores.b2 = { score: 85, eligible: true };
      scores.b3 = { score: 40, eligible: true };

      const qb = buildQb(analyses);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      mockArticleStreamRepo.find.mockResolvedValue([
        { articleId: 'shared', streamId: 'stream-a' },
        { articleId: 'shared', streamId: 'stream-b' },
        { articleId: 'a2', streamId: 'stream-a' },
        { articleId: 'b2', streamId: 'stream-b' },
        { articleId: 'b3', streamId: 'stream-b' },
      ]);

      const result = await service.getFeed(userId, {
        beforeDate: '2026-07-25',
        days: 1,
      } as QueryFeedDto);

      const ids = result.days[0].articles.map((a) => a.articleId);
      expect(ids).toContain('shared');
      expect(ids.filter((id) => id === 'shared')).toHaveLength(1);
      expect(ids).toEqual(expect.arrayContaining(['shared', 'a2', 'b2', 'b3']));
      expect(ids).toHaveLength(4);
    });
  });

  describe('saved=true path', () => {
    it('rejects saved=true combined with a topical filter (400)', async () => {
      await expect(
        service.getFeed(userId, { saved: true, source: ['some-id'] } as QueryFeedDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('never excludes a saved article on stream-eligibility, even when the scorer marks it ineligible', async () => {
      const analysis = makeAnalysis('saved-1');
      const savedQb = buildQb([{ articleId: 'saved-1', article: analysis.article }]);
      mockSavedArticleRepo.createQueryBuilder.mockReturnValue(savedQb);
      const analysisQb = buildQb([analysis]);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(analysisQb);
      scores['saved-1'] = { score: 42, eligible: false }; // ineligible on stream match alone

      const result = await service.getFeed(userId, {
        saved: true,
        beforeDate: '2026-07-25',
        days: 1,
      } as QueryFeedDto);

      expect(result.days[0].articles.map((a) => a.articleId)).toEqual(['saved-1']);
    });

    it('caps the saved-path day list at 100, defensively, without stream distribution', async () => {
      const savedRows = Array.from({ length: 120 }, (_, i) => ({ articleId: `s-${i}` }));
      const analyses = savedRows.map((r) => makeAnalysis(r.articleId));
      analyses.forEach((_, i) => {
        scores[`s-${i}`] = { score: i, eligible: true };
      });

      const savedQb = buildQb(
        savedRows.map((r, i) => ({ articleId: r.articleId, article: analyses[i].article })),
      );
      mockSavedArticleRepo.createQueryBuilder.mockReturnValue(savedQb);
      const analysisQb = buildQb(analyses);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(analysisQb);

      const result = await service.getFeed(userId, {
        saved: true,
        beforeDate: '2026-07-25',
        days: 1,
      } as QueryFeedDto);

      expect(result.days[0].articles).toHaveLength(100);
    });
  });

  describe('redirect link rendering', () => {
    it('calls findOrCreateLinksBatch once with only the final trimmed article set, and renders /go/{linkId}', async () => {
      const analyses = [makeAnalysis('article-1'), makeAnalysis('article-2')];
      scores['article-1'] = { score: 90, eligible: true };
      scores['article-2'] = { score: 10, eligible: false }; // dropped — not in the final set
      const qb = buildQb(analyses);
      mockAnalysisRepo.createQueryBuilder.mockReturnValue(qb);
      process.env.APP_URL = 'https://app.example.com';

      const result = await service.getFeed(userId, {
        beforeDate: '2026-07-25',
        days: 1,
      } as QueryFeedDto);

      expect(mockPersonalArticleLinkService.findOrCreateLinksBatch).toHaveBeenCalledTimes(1);
      expect(mockPersonalArticleLinkService.findOrCreateLinksBatch).toHaveBeenCalledWith(
        userId,
        ['article-1'],
        PersonalArticleLinkContext.FEED,
      );
      expect(result.days[0].articles[0].url).toBe('https://app.example.com/go/link-article-1');
      delete process.env.APP_URL;
    });
  });
});
