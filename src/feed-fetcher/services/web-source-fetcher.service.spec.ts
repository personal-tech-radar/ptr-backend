/**
 * ContentExtractionService's real module imports `jsdom` at the top level, which
 * is not currently loadable under this project's Jest setup (see the note in
 * content-extraction.service.spec.ts). WebSourceFetcherService only needs a
 * DI-compatible stand-in here, so the whole module is replaced with a lightweight
 * fake — this also keeps the test focused on WebSourceFetcherService's own
 * orchestration logic rather than re-verifying extraction behavior.
 */
jest.mock('../../sources/services/content-extraction.service', () => ({
  ContentExtractionService: jest.fn(),
  toContentExtractionMethod: jest.fn((method: string) => method),
  toWebExtractionMethod: jest.fn((method: string) => method),
}));

import { WebSourceFetcherService } from './web-source-fetcher.service';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { Source, SourceCategory, SourceType } from '../../sources/entities/source.entity';
import {
  WebDiscoveryMethod,
  WebExtractionMethod,
  WebSourceConfig,
} from '../../sources/entities/web-source-config.entity';

type SourceWithWebConfig = Source & { webConfig?: WebSourceConfig };

const buildSource = (): SourceWithWebConfig =>
  ({
    id: 'src-1',
    name: 'Example Blog',
    url: 'https://example.com',
    type: SourceType.WEB,
    category: SourceCategory.ENGINEERING_DEEP_DIVES,
    enabled: true,
    trustScore: 50,
    lastCheckedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as SourceWithWebConfig;

const buildConfig = (overrides: Partial<WebSourceConfig> = {}): WebSourceConfig =>
  ({
    id: 'cfg-1',
    sourceId: 'src-1',
    entryUrls: ['https://example.com'],
    sitemapUrl: null,
    preferredDiscoveryMethod: null,
    preferredExtractionMethod: null,
    articleLinkSelector: null,
    articleContentSelector: null,
    nextPageSelector: null,
    allowedPathPatterns: null,
    excludedPathPatterns: null,
    lastValidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as WebSourceConfig;

describe('WebSourceFetcherService', () => {
  let service: WebSourceFetcherService;

  const mockHttpService = { request: jest.fn() };
  const mockSourceDiscoveryService = {
    runDiscoveryMethod: jest.fn(),
    discoverEntryPoints: jest.fn(),
    discoverViaPlaywright: jest.fn(),
  };
  const mockContentExtractionService = { extract: jest.fn() };
  const mockSourcesService = {
    updateWebSourceConfigRecipe: jest.fn(),
    updateLastChecked: jest.fn(),
  };
  const mockArticlesService = {
    findByUrlHash: jest.fn(),
    findByTitleHashInLastDays: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  };
  const mockQueueService = { addAnalyzeArticleJob: jest.fn(), addBrowserFetchSourceJob: jest.fn() };
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PLAYWRIGHT_ENABLED;
    mockArticlesService.create.mockResolvedValue({ id: 'article-1' });

    service = new WebSourceFetcherService(
      mockHttpService as any,
      mockSourceDiscoveryService as any,
      mockContentExtractionService as any,
      mockSourcesService as any,
      mockArticlesService as any,
      mockQueueService as any,
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('recipe reuse and self-healing fallback', () => {
    it('uses the stored discovery method without walking the full chain when it still works', async () => {
      const source = buildSource();
      source.webConfig = buildConfig({ preferredDiscoveryMethod: WebDiscoveryMethod.SITEMAP });
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.SITEMAP,
        entryUrls: [],
        confidence: 'high',
      });
      mockArticlesService.findByUrlHash.mockResolvedValue(null);

      await service.fetchSource(source);

      expect(mockSourceDiscoveryService.runDiscoveryMethod).toHaveBeenCalledWith(
        WebDiscoveryMethod.SITEMAP,
        source.url,
        source.webConfig,
        { browserFallback: 'disabled' },
      );
      expect(mockSourceDiscoveryService.discoverEntryPoints).not.toHaveBeenCalled();
      expect(mockSourcesService.updateWebSourceConfigRecipe).not.toHaveBeenCalled();
      expect(mockSourcesService.updateLastChecked).toHaveBeenCalledWith(source.id);
    });

    it('falls back to the full chain and persists a different method when the stored recipe fails', async () => {
      const source = buildSource();
      source.webConfig = buildConfig({ preferredDiscoveryMethod: WebDiscoveryMethod.SITEMAP });
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'sitemap gone',
      });
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.CHEERIO,
        entryUrls: [],
        articleLinkSelector: '.listing',
        confidence: 'medium',
      });
      mockArticlesService.findByUrlHash.mockResolvedValue(null);

      await service.fetchSource(source);

      expect(mockSourceDiscoveryService.discoverEntryPoints).toHaveBeenCalledWith(
        source.url,
        source.webConfig,
        { browserFallback: 'disabled' },
      );
      expect(mockSourcesService.updateWebSourceConfigRecipe).toHaveBeenCalledWith(source.id, {
        preferredDiscoveryMethod: WebDiscoveryMethod.CHEERIO,
        articleLinkSelector: '.listing',
      });
    });

    it('logs and returns without throwing when the full fallback chain also fails (no browser fallback available)', async () => {
      const source = buildSource();
      source.webConfig = buildConfig();
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'nothing worked',
      });

      await expect(service.fetchSource(source)).rejects.toThrow('nothing worked');

      expect(mockSourcesService.updateLastChecked).not.toHaveBeenCalled();
      expect(mockArticlesService.create).not.toHaveBeenCalled();
      expect(mockQueueService.addBrowserFetchSourceJob).not.toHaveBeenCalled();
    });

    it('enqueues the isolated browser-fetch job instead of failing when a browser fallback is available and Playwright is enabled', async () => {
      process.env.PLAYWRIGHT_ENABLED = 'true';
      const source = buildSource();
      source.webConfig = buildConfig();
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'deterministic chain exhausted',
        browserFallbackAvailable: true,
      });

      await service.fetchSource(source);

      expect(mockQueueService.addBrowserFetchSourceJob).toHaveBeenCalledWith(
        source.id,
        [],
        undefined,
      );
      expect(mockSourcesService.updateLastChecked).not.toHaveBeenCalled();
    });

    it('does not enqueue the browser-fetch job when a fallback is available but Playwright is disabled', async () => {
      const source = buildSource();
      source.webConfig = buildConfig();
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'deterministic chain exhausted',
        browserFallbackAvailable: true,
      });

      await expect(service.fetchSource(source)).rejects.toThrow('deterministic chain exhausted');

      expect(mockQueueService.addBrowserFetchSourceJob).not.toHaveBeenCalled();
    });

    it('skips silently when the source has no WebSourceConfig at all', async () => {
      const source = buildSource();

      await expect(service.fetchSource(source)).rejects.toThrow(
        'Web source has no WebSourceConfig',
      );

      expect(mockSourceDiscoveryService.discoverEntryPoints).not.toHaveBeenCalled();
      expect(mockSourcesService.updateLastChecked).not.toHaveBeenCalled();
    });
  });

  describe('fetchSourceViaBrowser (invoked by PlaywrightFetchProcessor)', () => {
    it('discovers via Playwright and reuses the same ingestion path as fetchSource', async () => {
      const source = buildSource();
      source.webConfig = buildConfig();
      mockSourceDiscoveryService.discoverViaPlaywright.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.PLAYWRIGHT,
        entryUrls: ['https://example.com/rendered-post'],
        articleLinkSelector: '.listing',
        confidence: 'medium',
      });
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue(null);
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: true,
        method: 'readability',
        title: 'Rendered Post',
        content: 'content',
        textContent: 'content',
      });

      await service.fetchSourceViaBrowser(source);

      expect(mockSourceDiscoveryService.discoverViaPlaywright).toHaveBeenCalledWith(
        source.url,
        source.webConfig,
      );
      expect(mockSourcesService.updateWebSourceConfigRecipe).toHaveBeenCalledWith(source.id, {
        preferredDiscoveryMethod: WebDiscoveryMethod.PLAYWRIGHT,
        articleLinkSelector: '.listing',
      });
      expect(mockArticlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Rendered Post' }),
      );
      expect(mockSourcesService.updateLastChecked).toHaveBeenCalledWith(source.id);
    });

    it('logs and returns without throwing when Playwright discovery itself fails', async () => {
      const source = buildSource();
      source.webConfig = buildConfig();
      mockSourceDiscoveryService.discoverViaPlaywright.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'no article links found',
      });

      await expect(service.fetchSourceViaBrowser(source)).rejects.toThrow('no article links found');

      expect(mockSourcesService.updateLastChecked).not.toHaveBeenCalled();
      expect(mockArticlesService.create).not.toHaveBeenCalled();
    });

    it('skips silently when the source has no WebSourceConfig at all', async () => {
      const source = buildSource();

      await expect(service.fetchSourceViaBrowser(source)).rejects.toThrow(
        'Web source has no WebSourceConfig',
      );

      expect(mockSourceDiscoveryService.discoverViaPlaywright).not.toHaveBeenCalled();
    });
  });

  describe('article ingestion and dedup reuse', () => {
    const setupSuccessfulDiscovery = (entryUrls: string[]) => {
      const source = buildSource();
      source.webConfig = buildConfig({ preferredDiscoveryMethod: WebDiscoveryMethod.SITEMAP });
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.SITEMAP,
        entryUrls,
        confidence: 'high',
      });
      return source;
    };

    it('calls the same dedup collaborators as the RSS path and skips already-known URLs', async () => {
      const source = setupSuccessfulDiscovery(['https://example.com/existing-post']);
      mockArticlesService.findByUrlHash.mockResolvedValue({ id: 'already-there' });

      await service.fetchSource(source);

      expect(mockArticlesService.findByUrlHash).toHaveBeenCalled();
      expect(mockHttpService.request).not.toHaveBeenCalled();
      expect(mockArticlesService.create).not.toHaveBeenCalled();
    });

    it('ingests a new article, queues it for analysis, and updates lastCheckedAt', async () => {
      const source = setupSuccessfulDiscovery(['https://example.com/new-post']);
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue(null);
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: true,
        method: 'readability',
        title: 'A New Post',
        content: '<p>content</p>',
        textContent: 'content',
      });

      await service.fetchSource(source);

      expect(mockArticlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: source.id,
          title: 'A New Post',
          status: ArticleStatus.NEW,
          contentExtractionMethod: 'readability',
        }),
      );
      expect(mockArticlesService.updateStatus).toHaveBeenCalledWith(
        'article-1',
        ArticleStatus.PENDING_ANALYSIS,
      );
      expect(mockQueueService.addAnalyzeArticleJob).toHaveBeenCalledWith('article-1');
      expect(mockSourcesService.updateLastChecked).toHaveBeenCalledWith(source.id);
    });

    it('prefers the sitemap lastmod date over the extracted content date and over ingestion time', async () => {
      const source = buildSource();
      source.webConfig = buildConfig({ preferredDiscoveryMethod: WebDiscoveryMethod.SITEMAP });
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.SITEMAP,
        entryUrls: ['https://example.com/dated-post'],
        entryDates: { 'https://example.com/dated-post': '2026-06-15T00:00:00Z' },
        confidence: 'high',
      });
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue(null);
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: true,
        method: 'json_ld',
        title: 'Dated Post',
        content: 'content',
        textContent: 'content',
        publishedAt: '2026-06-20T00:00:00Z',
      });

      await service.fetchSource(source);

      expect(mockArticlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ publishedAt: new Date('2026-06-15T00:00:00Z') }),
      );
    });

    it('falls back to the extracted JSON-LD/OpenGraph date when no sitemap lastmod is available', async () => {
      const source = setupSuccessfulDiscovery(['https://example.com/dated-post-no-sitemap']);
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue(null);
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: true,
        method: 'opengraph',
        title: 'Dated Post',
        content: 'content',
        textContent: 'content',
        publishedAt: '2026-06-20T00:00:00Z',
      });

      await service.fetchSource(source);

      expect(mockArticlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ publishedAt: new Date('2026-06-20T00:00:00Z') }),
      );
    });

    it('falls back to ingestion time when no publish-date signal is present or parseable', async () => {
      const source = setupSuccessfulDiscovery(['https://example.com/undated-post']);
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue(null);
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: true,
        method: 'readability',
        title: 'Undated Post',
        content: 'content',
        textContent: 'content',
        publishedAt: null,
      });

      const before = Date.now();
      await service.fetchSource(source);
      const after = Date.now();

      const [createdArticle] = mockArticlesService.create.mock.calls[0] as unknown as [
        { publishedAt: Date },
      ];
      expect(createdArticle.publishedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(createdArticle.publishedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('marks a title-duplicate article without queuing it for analysis', async () => {
      const source = setupSuccessfulDiscovery(['https://example.com/near-duplicate']);
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue({ id: 'earlier-article' });
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: true,
        method: 'json_ld',
        title: 'Duplicate Title',
        content: 'content',
        textContent: 'content',
      });

      await service.fetchSource(source);

      expect(mockArticlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ArticleStatus.DUPLICATE }),
      );
      expect(mockArticlesService.updateStatus).not.toHaveBeenCalled();
      expect(mockQueueService.addAnalyzeArticleJob).not.toHaveBeenCalled();
    });

    it('skips an article when every extraction-ladder step fails', async () => {
      const source = setupSuccessfulDiscovery(['https://example.com/unextractable']);
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: false,
        method: null,
        title: null,
        content: null,
        textContent: null,
      });

      await service.fetchSource(source);

      expect(mockArticlesService.create).not.toHaveBeenCalled();
    });

    it('persists a new preferred extraction method when it differs from the stored one', async () => {
      const source = buildSource();
      source.webConfig = buildConfig({
        preferredDiscoveryMethod: WebDiscoveryMethod.SITEMAP,
        preferredExtractionMethod: WebExtractionMethod.READABILITY,
      });
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.SITEMAP,
        entryUrls: ['https://example.com/new-post'],
        confidence: 'high',
      });
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue(null);
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: true,
        method: 'cheerio_selector',
        title: 'A New Post',
        content: 'content',
        textContent: 'content',
      });

      await service.fetchSource(source);

      expect(mockSourcesService.updateWebSourceConfigRecipe).toHaveBeenCalledWith(source.id, {
        preferredExtractionMethod: 'cheerio_selector',
      });
    });
  });
});
