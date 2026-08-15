import { ArticleStatus } from '../../articles/entities/article.entity';
import { Logger } from '@nestjs/common';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { AiAnalysisService } from './ai-analysis.service';
import { ArticleAnalysis } from '../entities/article-analysis.entity';
import { ArticleStream } from '../entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../entities/article-technology-interest.entity';

function openAiResponse(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

describe('AiAnalysisService', () => {
  let service: AiAnalysisService;

  const articleId = 'article-1';
  const article = {
    id: articleId,
    title: 'A test article',
    url: 'https://example.com/a',
    author: 'Jane Doe',
    summaryFromFeed: 'A summary',
    publishedAt: new Date(),
    status: ArticleStatus.PENDING_ANALYSIS,
  };

  const mockAnalysisRepo = {
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn(),
  };

  const mockArticlesService = {
    findOne: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };

  const mockResolverService = {
    resolve: jest.fn(),
    resolveExisting: jest.fn(),
  };

  const mockContentStreamQueryService = {
    findByKey: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
  };

  const mockManager = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((_entity: unknown, data: unknown) => Promise.resolve(data)),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockDataSource = {
    transaction: jest.fn((cb: (manager: unknown) => unknown) => cb(mockManager)),
  };

  const mockOpenAi = {
    chat: { completions: { create: jest.fn() } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockArticlesService.findOne.mockResolvedValue(article);
    mockManager.findOne.mockResolvedValue(null);
    mockContentStreamQueryService.findByKey.mockResolvedValue(null);
    mockResolverService.resolveExisting.mockResolvedValue(null);

    service = new AiAnalysisService(
      mockAnalysisRepo as any,
      mockArticlesService as any,
      mockResolverService as any,
      mockContentStreamQueryService as any,
      { findAllActive: jest.fn().mockResolvedValue([]) } as any,
      { increment: jest.fn() } as any,
      mockDataSource as any,
    );
    (service as any).openai = mockOpenAi;
  });

  function mockPreScreen(isPotentiallyRelevant: boolean, shortReason = 'reason') {
    mockOpenAi.chat.completions.create.mockResolvedValueOnce(
      openAiResponse({ isPotentiallyRelevant, shortReason }),
    );
  }

  function mockFullAnalysis(overrides: Record<string, unknown> = {}) {
    mockOpenAi.chat.completions.create.mockResolvedValueOnce(
      openAiResponse({
        shortSummary: 'summary',
        whyItMatters: 'matters',
        practicalValue: 'value',
        tags: ['tag'],
        relevanceScore: 80,
        qualityScore: 70,
        complexityLevel: 'advanced',
        materialType: 'tutorial',
        urgencyScore: 40,
        evergreen: true,
        breakingChanges: false,
        releaseData: null,
        securityData: null,
        mainStreamKey: 'security',
        secondaryStreamKeys: ['industry_pulse'],
        technologySignals: [],
        interestSignals: [],
        shouldIncludeInDailyDigest: true,
        shouldIncludeInWeeklyDigest: false,
        ...overrides,
      }),
    );
  }

  describe('analyzeArticle — Stage 1 (pre-screen)', () => {
    it('logs safe provider context without credential fragments on authentication failure', async () => {
      mockAnalysisRepo.findOne.mockResolvedValue(null);
      mockOpenAi.chat.completions.create.mockRejectedValueOnce(
        Object.assign(
          new Error('Incorrect API key provided: sk-proj-************************X9MA.'),
          { status: 401 },
        ),
      );
      const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await service.analyzeArticle(articleId);

      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining(
          '"provider":"openai","providerStatus":401,"retryable":false,"requestContext":"pre-analysis"',
        ),
        expect.not.stringContaining('X9MA'),
      );
      expect(mockArticlesService.updateStatus).toHaveBeenCalledWith(
        articleId,
        ArticleStatus.FAILED,
      );
    });

    it('stops after Stage 1 and never runs Stage 2 when the article is not relevant', async () => {
      mockAnalysisRepo.findOne.mockResolvedValue(null);
      mockAnalysisRepo.save.mockResolvedValue({
        id: 'aa-1',
        articleId,
        preScreenIsRelevant: false,
        fullAnalysisAt: null,
      });
      mockPreScreen(false, 'not relevant');

      await service.analyzeArticle(articleId);

      expect(mockOpenAi.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockArticlesService.updateStatus).toHaveBeenCalledWith(
        articleId,
        ArticleStatus.SKIPPED,
      );
    });

    it('runs Stage 2 and populates the analysis row when the article passes pre-screen', async () => {
      mockAnalysisRepo.findOne.mockResolvedValue(null);
      mockAnalysisRepo.save.mockResolvedValue({
        id: 'aa-1',
        articleId,
        preScreenIsRelevant: true,
        fullAnalysisAt: null,
      });
      mockPreScreen(true);
      mockFullAnalysis();
      mockContentStreamQueryService.findByKey.mockImplementation((key: string) =>
        Promise.resolve(key === 'security' ? { id: 'stream-security', key } : null),
      );

      await service.analyzeArticle(articleId);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.save).toHaveBeenCalledWith(
        ArticleAnalysis,
        expect.objectContaining({
          shortSummary: 'summary',
          longSummary: 'summary',
          relevanceScore: 80,
          qualityScore: 70,
          finalScore: 80 * 0.6 + 70 * 0.4,
          complexityLevel: 'advanced',
          materialType: 'tutorial',
          fullAnalysisAt: expect.any(Date),
        }),
      );
      expect(mockArticlesService.updateStatus).toHaveBeenCalledWith(
        articleId,
        ArticleStatus.ANALYZED,
      );
    });
  });

  describe('analyzeArticle — idempotent resume', () => {
    it('skips Stage 2 entirely when the existing row already has fullAnalysisAt set', async () => {
      mockAnalysisRepo.findOne.mockResolvedValue({
        id: 'aa-1',
        articleId,
        preScreenIsRelevant: true,
        fullAnalysisAt: new Date(),
      });

      await service.analyzeArticle(articleId);

      expect(mockOpenAi.chat.completions.create).not.toHaveBeenCalled();
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockArticlesService.updateStatus).toHaveBeenCalledWith(
        articleId,
        ArticleStatus.ANALYZED,
      );
    });

    it('stops without Stage 2 when the existing row already failed pre-screen', async () => {
      mockAnalysisRepo.findOne.mockResolvedValue({
        id: 'aa-1',
        articleId,
        preScreenIsRelevant: false,
        fullAnalysisAt: null,
      });

      await service.analyzeArticle(articleId);

      expect(mockOpenAi.chat.completions.create).not.toHaveBeenCalled();
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('resumes into Stage 2 when the existing row passed pre-screen but was never fully analyzed', async () => {
      mockAnalysisRepo.findOne.mockResolvedValue({
        id: 'aa-1',
        articleId,
        preScreenIsRelevant: true,
        fullAnalysisAt: null,
      });
      mockFullAnalysis();

      await service.analyzeArticle(articleId);

      expect(mockOpenAi.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('analyzeArticle — 23505 race on Stage 1 insert', () => {
    it('resumes Stage 2 from the racing row when it is relevant and not yet fully analyzed', async () => {
      mockAnalysisRepo.findOne
        .mockResolvedValueOnce(null) // initial lookup: nothing yet
        .mockResolvedValueOnce({
          id: 'aa-1',
          articleId,
          preScreenIsRelevant: true,
          fullAnalysisAt: null,
        }); // re-fetch after the unique violation
      mockPreScreen(true);
      mockAnalysisRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('dup'), { code: '23505' }),
      );
      mockFullAnalysis();

      await service.analyzeArticle(articleId);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('marks ANALYZED without Stage 2 when the racing row is already fully analyzed', async () => {
      mockAnalysisRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'aa-1',
        articleId,
        preScreenIsRelevant: true,
        fullAnalysisAt: new Date(),
      });
      mockPreScreen(true);
      mockAnalysisRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('dup'), { code: '23505' }),
      );

      await service.analyzeArticle(articleId);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockArticlesService.updateStatus).toHaveBeenCalledWith(
        articleId,
        ArticleStatus.ANALYZED,
      );
    });
  });

  describe('preAnalyzeArticle', () => {
    it('returns the existing row without calling OpenAI when one already exists', async () => {
      const existing = { id: 'aa-1', articleId, preScreenIsRelevant: true };
      mockAnalysisRepo.findOne.mockResolvedValue(existing);

      const result = await service.preAnalyzeArticle(articleId);

      expect(result).toEqual(existing);
      expect(mockOpenAi.chat.completions.create).not.toHaveBeenCalled();
      expect(mockArticlesService.findOne).not.toHaveBeenCalled();
    });

    it('creates a pre-screen-only row when none exists yet', async () => {
      mockAnalysisRepo.findOne.mockResolvedValue(null);
      mockPreScreen(true, 'looks relevant');
      const saved = { id: 'aa-1', articleId, preScreenIsRelevant: true };
      mockAnalysisRepo.save.mockResolvedValue(saved);

      const result = await service.preAnalyzeArticle(articleId);

      expect(result).toEqual(saved);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('returns the racing row on a 23505 unique violation', async () => {
      mockAnalysisRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'aa-1', articleId, preScreenIsRelevant: true });
      mockPreScreen(true);
      mockAnalysisRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('dup'), { code: '23505' }),
      );

      const result = await service.preAnalyzeArticle(articleId);

      expect(result).toEqual({ id: 'aa-1', articleId, preScreenIsRelevant: true });
    });
  });

  describe('technology/interest signal resolution', () => {
    beforeEach(() => {
      mockAnalysisRepo.findOne.mockResolvedValue({
        id: 'aa-1',
        articleId,
        preScreenIsRelevant: true,
        fullAnalysisAt: null,
      });
    });

    it('creates an ArticleTechnologyInterest link for a matched signal', async () => {
      mockFullAnalysis({ technologySignals: ['Kubernetes'], interestSignals: [] });
      mockResolverService.resolveExisting.mockResolvedValueOnce({ id: 'ti-1' });

      await service.analyzeArticle(articleId);

      expect(mockResolverService.resolveExisting).toHaveBeenCalledWith(
        TechnologyInterestKind.TECHNOLOGY,
        'Kubernetes',
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        ArticleTechnologyInterest,
        expect.objectContaining({ articleId, technologyInterestId: 'ti-1' }),
      );
    });

    it('drops an unmatched signal silently, never calling resolve()/create', async () => {
      mockFullAnalysis({ technologySignals: ['SomeBrandNewTool'], interestSignals: [] });
      mockResolverService.resolveExisting.mockResolvedValueOnce(null);

      await service.analyzeArticle(articleId);

      expect(mockResolverService.resolve).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalledWith(
        ArticleTechnologyInterest,
        expect.anything(),
      );
    });
  });

  describe('main/secondary stream resolution', () => {
    beforeEach(() => {
      mockAnalysisRepo.findOne.mockResolvedValue({
        id: 'aa-1',
        articleId,
        preScreenIsRelevant: true,
        fullAnalysisAt: null,
      });
    });

    it('writes mainStreamId and the isPrimary ArticleStream row together in one transaction', async () => {
      mockFullAnalysis({ mainStreamKey: 'security', secondaryStreamKeys: ['industry_pulse'] });
      mockContentStreamQueryService.findByKey.mockImplementation((key: string) => {
        if (key === 'security') return Promise.resolve({ id: 'stream-security', key });
        if (key === 'industry_pulse') return Promise.resolve({ id: 'stream-industry', key });
        return Promise.resolve(null);
      });

      await service.analyzeArticle(articleId);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.save).toHaveBeenCalledWith(
        ArticleAnalysis,
        expect.objectContaining({ mainStreamId: 'stream-security' }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        ArticleStream,
        expect.objectContaining({ streamId: 'stream-security', isPrimary: true }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        ArticleStream,
        expect.objectContaining({ streamId: 'stream-industry', isPrimary: false }),
      );
    });

    it('leaves mainStreamId null and skips the primary stream row when mainStreamKey does not resolve', async () => {
      mockFullAnalysis({ mainStreamKey: 'not-a-real-stream', secondaryStreamKeys: [] });
      mockContentStreamQueryService.findByKey.mockResolvedValue(null);

      await service.analyzeArticle(articleId);

      expect(mockManager.save).toHaveBeenCalledWith(
        ArticleAnalysis,
        expect.objectContaining({ mainStreamId: null }),
      );
      expect(mockManager.save).not.toHaveBeenCalledWith(ArticleStream, expect.anything());
    });
  });
});
