// jsdom/@mozilla/readability are mocked at the module boundary, same as
// content-extraction.service.spec.ts and source-candidates.service.spec.ts: jsdom v29's
// dependency tree is ESM-only several levels deep and isn't loadable under this project's
// Jest/ts-jest setup (pre-existing test-infra gap). This spec only reaches jsdom transitively
// (via FeedFetcherService's real import chain, used here purely as a DI token type), never
// calls it directly.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { AiAnalysisService } from '../../ai-analysis/services/ai-analysis.service';
import { ArticlesService } from '../../articles/services/articles.service';
import { FeedFetcherService } from '../../feed-fetcher/services/feed-fetcher.service';
import { DigestBootstrapService } from './digest-bootstrap.service';
import { DigestBuilderService } from './digest-builder.service';

// Regression coverage for the MVP3 phase 5 change: DigestBootstrapService must never implicitly
// seed sources from config/sources.manifest.json anymore. A fresh/empty sources table is now an
// explicit operational state — `npm run seed:sources:sync` is the only path that populates it.
//
// No SourcesService provider is registered in this TestingModule at all: if DigestBootstrapService
// still depended on it (as the removed seedSourcesIfEmpty() did), `Test.createTestingModule(...)
// .compile()` below would throw a "Nest can't resolve dependencies" error before any test body
// even ran. That failure mode is itself the strongest regression guard here.
describe('DigestBootstrapService', () => {
  let service: DigestBootstrapService;

  const mockFeedFetcherService = {
    fetchAllSources: jest.fn().mockResolvedValue(undefined),
  };

  const mockArticlesService = {
    findPendingAnalysis: jest.fn().mockResolvedValue([]),
  };

  const mockAiAnalysisService = {
    analyzeArticle: jest.fn().mockResolvedValue(undefined),
  };

  const mockDigestBuilderService = {
    buildDailyDigest: jest.fn().mockResolvedValue(null),
    buildWeeklyDigest: jest.fn().mockResolvedValue(null),
    buildDeepDiveWeeklyDigest: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFeedFetcherService.fetchAllSources.mockResolvedValue(undefined);
    mockArticlesService.findPendingAnalysis.mockResolvedValue([]);
    mockDigestBuilderService.buildDailyDigest.mockResolvedValue(null);
    mockDigestBuilderService.buildWeeklyDigest.mockResolvedValue(null);
    mockDigestBuilderService.buildDeepDiveWeeklyDigest.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestBootstrapService,
        { provide: FeedFetcherService, useValue: mockFeedFetcherService },
        { provide: ArticlesService, useValue: mockArticlesService },
        { provide: AiAnalysisService, useValue: mockAiAnalysisService },
        { provide: DigestBuilderService, useValue: mockDigestBuilderService },
      ],
    }).compile();

    service = module.get(DigestBootstrapService);
  });

  it('does not seed any Source rows when building the daily digest against an empty sources table', async () => {
    await service.buildDailyDigest();

    expect(mockFeedFetcherService.fetchAllSources).toHaveBeenCalledTimes(1);
    expect(mockDigestBuilderService.buildDailyDigest).toHaveBeenCalledTimes(1);
  });

  it('does not seed any Source rows when building the weekly digest', async () => {
    await service.buildWeeklyDigest();

    expect(mockDigestBuilderService.buildWeeklyDigest).toHaveBeenCalledTimes(1);
  });

  it('does not seed any Source rows when building the deep-dive weekly digest', async () => {
    await service.buildDeepDiveWeeklyDigest();

    expect(mockDigestBuilderService.buildDeepDiveWeeklyDigest).toHaveBeenCalledTimes(1);
  });

  it('still analyzes pending articles before building (unaffected responsibility)', async () => {
    mockArticlesService.findPendingAnalysis.mockResolvedValue([{ id: 'article-1' }]);

    await service.buildDailyDigest();

    expect(mockAiAnalysisService.analyzeArticle).toHaveBeenCalledWith('article-1');
  });
});
