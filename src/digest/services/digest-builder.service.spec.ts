import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleRelevance } from '../../ai-analysis/entities/article-relevance.entity';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { SourceCategory } from '../../sources/entities/source.entity';
import { DigestItem } from '../entities/digest-item.entity';
import { Digest, DigestStatus, DigestType } from '../entities/digest.entity';
import { DigestBuildConfig } from '../digest.types';
import { AiDigestService } from './ai-digest.service';
import { EmailTemplateService } from './email-template.service';
import { DigestBuilderService } from './digest-builder.service';

const DAILY_CONFIG: DigestBuildConfig = {
  lookbackHours: 24,
  minItems: 5,
  maxItems: 5,
  subjectSuffix: 'Daily Brief',
  recencyFreshHours: 12,
  recencyRecentHours: 24,
  includeFlag: 'shouldIncludeInDailyDigest',
};

const mockDigestRepo = {
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: 'digest-1', ...data })),
};

const mockDigestItemRepo = {
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: 'item-1', ...data })),
  createQueryBuilder: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue([]),
};

const mockAnalysisRepo = {
  createQueryBuilder: jest.fn().mockReturnThis(),
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  getCount: jest.fn().mockResolvedValue(0),
};

const mockRelevanceRepo = {};

const mockAiDigestService = {
  generateIntro: jest.fn().mockResolvedValue('Test intro.'),
};

const mockEmailTemplateService = {
  renderHtml: jest.fn().mockReturnValue('<html>test</html>'),
  renderText: jest.fn().mockReturnValue('test'),
};

function makeAnalysis(overrides: Partial<ArticleAnalysis> = {}): ArticleAnalysis {
  return {
    id: 'aa-1',
    articleId: 'a-1',
    shortSummary: 'Summary',
    whyItMatters: 'It matters',
    practicalValue: 'Practical',
    tags: ['node'],
    relevanceScore: 80,
    qualityScore: 70,
    finalScore: 76,
    shouldIncludeInDailyDigest: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    article: {
      id: 'a-1',
      sourceId: 'src-1',
      title: 'Test Article',
      url: 'https://example.com/test',
      urlHash: 'hash1',
      titleHash: 'thash1',
      author: null,
      publishedAt: new Date(),
      summaryFromFeed: null,
      rawContent: null,
      status: ArticleStatus.ANALYZED,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      source: {
        id: 'src-1',
        name: 'Test Source',
        url: 'https://example.com/feed',
        type: 'rss' as any,
        category: SourceCategory.BACKEND_ARCHITECTURE_INFRA,
        enabled: true,
        trustScore: 80,
        lastCheckedAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    ...overrides,
  } as ArticleAnalysis;
}

describe('DigestBuilderService', () => {
  let service: DigestBuilderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDigestItemRepo.getRawMany.mockResolvedValue([]);
    mockAnalysisRepo.getCount.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestBuilderService,
        { provide: getRepositoryToken(Digest), useValue: mockDigestRepo },
        { provide: getRepositoryToken(DigestItem), useValue: mockDigestItemRepo },
        { provide: getRepositoryToken(ArticleAnalysis), useValue: mockAnalysisRepo },
        { provide: getRepositoryToken(ArticleRelevance), useValue: mockRelevanceRepo },
        { provide: AiDigestService, useValue: mockAiDigestService },
        { provide: EmailTemplateService, useValue: mockEmailTemplateService },
      ],
    }).compile();

    service = module.get(DigestBuilderService);
  });

  describe('getRecencyScore', () => {
    it('returns 100 for articles published within 12 hours', () => {
      const publishedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);
      expect(service.getRecencyScore(publishedAt, DAILY_CONFIG)).toBe(100);
    });

    it('returns 80 for articles published within 24 hours', () => {
      const publishedAt = new Date(Date.now() - 18 * 60 * 60 * 1000);
      expect(service.getRecencyScore(publishedAt, DAILY_CONFIG)).toBe(80);
    });

    it('returns 50 for articles older than 24 hours', () => {
      const publishedAt = new Date(Date.now() - 36 * 60 * 60 * 1000);
      expect(service.getRecencyScore(publishedAt, DAILY_CONFIG)).toBe(50);
    });

    it('returns 50 when publishedAt is null', () => {
      expect(service.getRecencyScore(null, DAILY_CONFIG)).toBe(50);
    });
  });

  describe('computeFinalScore', () => {
    it('calculates score using weighted formula', () => {
      const analysis = makeAnalysis({
        relevanceScore: 80,
        qualityScore: 70,
      });
      analysis.article.source.trustScore = 90;
      analysis.article.publishedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);

      const score = service.computeFinalScore(analysis, DAILY_CONFIG);
      const expected = 80 * 0.45 + 70 * 0.3 + 90 * 0.15 + 100 * 0.1;
      expect(score).toBeCloseTo(expected, 5);
    });

    it('uses trustScore 50 when source is missing', () => {
      const analysis = makeAnalysis();
      analysis.article.source = undefined as any;
      analysis.article.publishedAt = null;
      const score = service.computeFinalScore(analysis, DAILY_CONFIG);
      const expected =
        Number(analysis.relevanceScore) * 0.45 +
        Number(analysis.qualityScore) * 0.3 +
        50 * 0.15 +
        50 * 0.1;
      expect(score).toBeCloseTo(expected, 5);
    });
  });

  describe('selectWithDiversification', () => {
    it('selects at most 5 articles', () => {
      const candidates = Array.from({ length: 10 }, (_, i) =>
        makeAnalysis({
          id: `aa-${i}`,
          articleId: `a-${i}`,
          article: {
            ...makeAnalysis().article,
            id: `a-${i}`,
            sourceId: `src-${i}`,
          } as any,
        }),
      ).map((a) => ({ analysis: a, computedFinalScore: 80 }));

      const result = service.selectWithDiversification(candidates, 5);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('limits to 2 articles per source', () => {
      const candidates = Array.from({ length: 4 }, (_, i) =>
        makeAnalysis({
          id: `aa-${i}`,
          articleId: `a-${i}`,
          article: {
            ...makeAnalysis().article,
            id: `a-${i}`,
            sourceId: 'same-source',
          } as any,
        }),
      ).map((a) => ({ analysis: a, computedFinalScore: 80 }));

      const result = service.selectWithDiversification(candidates, 5);
      expect(result.length).toBe(2);
    });

    it('returns empty array when no candidates', () => {
      expect(service.selectWithDiversification([], 5)).toEqual([]);
    });

    it('fills slots by relaxing category limit when needed', () => {
      const candidates = Array.from({ length: 6 }, (_, i) =>
        makeAnalysis({
          id: `aa-${i}`,
          articleId: `a-${i}`,
          article: {
            ...makeAnalysis().article,
            id: `a-${i}`,
            sourceId: `src-${i}`,
            source: {
              ...makeAnalysis().article.source,
              id: `src-${i}`,
              category: SourceCategory.BACKEND_ARCHITECTURE_INFRA,
            },
          } as any,
        }),
      ).map((a) => ({ analysis: a, computedFinalScore: 80 }));

      const result = service.selectWithDiversification(candidates, 5);
      expect(result.length).toBe(5);
    });
  });

  describe('buildDailyDigest', () => {
    it('returns null when no candidates exist after all fallback windows', async () => {
      mockAnalysisRepo.getMany.mockResolvedValue([]);
      const result = await service.buildDailyDigest();
      expect(result).toBeNull();
    });

    it('builds and saves digest when enough candidates found in 24h window', async () => {
      const analysis = makeAnalysis();
      mockAnalysisRepo.getMany.mockResolvedValue([analysis]);
      mockAnalysisRepo.getCount.mockResolvedValue(1);

      const result = await service.buildDailyDigest();
      expect(result).toBeDefined();
      expect(mockDigestRepo.save).toHaveBeenCalledTimes(1);
      expect(mockDigestItemRepo.save).toHaveBeenCalledTimes(1);
    });

    it('sets digest status to DRAFT on creation', async () => {
      mockAnalysisRepo.getMany.mockResolvedValue([makeAnalysis()]);
      mockAnalysisRepo.getCount.mockResolvedValue(1);
      await service.buildDailyDigest();
      const saveCall = mockDigestRepo.save.mock.calls[0][0];
      expect(saveCall.status).toBe(DigestStatus.DRAFT);
    });

    it('includes date in subject', async () => {
      mockAnalysisRepo.getMany.mockResolvedValue([makeAnalysis()]);
      mockAnalysisRepo.getCount.mockResolvedValue(1);
      await service.buildDailyDigest();
      const saveCall = mockDigestRepo.save.mock.calls[0][0];
      expect(saveCall.subject).toMatch(/Personal Tech Radar — Daily Brief — \d{4}-\d{2}-\d{2}/);
    });

    it('sets digest type to DAILY', async () => {
      mockAnalysisRepo.getMany.mockResolvedValue([makeAnalysis()]);
      mockAnalysisRepo.getCount.mockResolvedValue(1);
      await service.buildDailyDigest();
      const saveCall = mockDigestRepo.save.mock.calls[0][0];
      expect(saveCall.type).toBe(DigestType.DAILY);
    });

    it('persists buildDebug with attempt data', async () => {
      const analyses = Array.from({ length: 5 }, (_, i) =>
        makeAnalysis({ id: `aa-${i}`, articleId: `a-${i}` }),
      );
      mockAnalysisRepo.getMany.mockResolvedValue(analyses);
      mockAnalysisRepo.getCount.mockResolvedValue(5);
      await service.buildDailyDigest();
      const saveCall = mockDigestRepo.save.mock.calls[0][0];
      expect(saveCall.buildDebug).toBeDefined();
      expect(saveCall.buildDebug.attempts).toHaveLength(1);
      expect(saveCall.buildDebug.finalWindowHours).toBe(24);
      expect(saveCall.buildDebug.fallbackUsed).toBe(false);
    });

    it('falls back to 48h window when 24h yields fewer than 5 candidates', async () => {
      const analyses = Array.from({ length: 6 }, (_, i) =>
        makeAnalysis({ id: `aa-${i}`, articleId: `a-${i}` }),
      );
      // First call (24h getEligible): 2 articles. Second call (48h getEligible): 6 articles.
      mockAnalysisRepo.getMany
        .mockResolvedValueOnce(analyses.slice(0, 2))
        .mockResolvedValue(analyses);
      mockAnalysisRepo.getCount.mockResolvedValue(2);

      const result = await service.buildDailyDigest();
      expect(result).toBeDefined();
      const saveCall = mockDigestRepo.save.mock.calls[0][0];
      expect(saveCall.buildDebug.fallbackUsed).toBe(true);
      expect(saveCall.buildDebug.attempts).toHaveLength(2);
      expect(saveCall.buildDebug.finalWindowHours).toBe(48);
    });

    it('excludes articles already in prior digests', async () => {
      mockDigestItemRepo.getRawMany.mockResolvedValue([{ articleId: 'used-article-id' }]);
      mockAnalysisRepo.getMany.mockResolvedValue([makeAnalysis()]);
      mockAnalysisRepo.getCount.mockResolvedValue(1);

      await service.buildDailyDigest();

      const andWhereCalls = mockAnalysisRepo.andWhere.mock.calls.map((c: any[]) => c[0]);
      const hasExcludeClause = andWhereCalls.some(
        (call: string) => typeof call === 'string' && call.includes('NOT IN'),
      );
      expect(hasExcludeClause).toBe(true);
    });
  });

  describe('buildWeeklyDigest', () => {
    it('returns null when no candidates exist', async () => {
      mockAnalysisRepo.getMany.mockResolvedValue([]);
      const result = await service.buildWeeklyDigest();
      expect(result).toBeNull();
    });

    it('sets digest type to WEEKLY when candidates exist', async () => {
      mockAnalysisRepo.getMany.mockResolvedValue([makeAnalysis()]);
      await service.buildWeeklyDigest();
      const saveCall = mockDigestRepo.save.mock.calls[0][0];
      expect(saveCall.type).toBe(DigestType.WEEKLY);
    });
  });
});