/**
 * WebSourceFetcherService is mocked at the module boundary purely to avoid its
 * transitive `jsdom` import (see the note in content-extraction.service.spec.ts) —
 * this test is about FeedFetcherService's own branching/regression behavior, not
 * WebSourceFetcherService's internals, which are covered in its own spec.
 */
jest.mock('./web-source-fetcher.service', () => ({ WebSourceFetcherService: jest.fn() }));

const mockParseURL = jest.fn();
jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({ parseURL: mockParseURL })));

import { FeedFetcherService } from './feed-fetcher.service';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { SourceCategory, SourceType } from '../../sources/entities/source.entity';

const buildRssSource = () => ({
  id: 'src-rss',
  name: 'RSS Blog',
  url: 'https://example.com/feed.xml',
  type: SourceType.RSS,
  category: SourceCategory.ENGINEERING_DEEP_DIVES,
  enabled: true,
});

const buildWebSource = () => ({
  id: 'src-web',
  name: 'Web Blog',
  url: 'https://example.com',
  type: SourceType.WEB,
  category: SourceCategory.ENGINEERING_DEEP_DIVES,
  enabled: true,
  webConfig: { id: 'cfg-1' },
});

describe('FeedFetcherService', () => {
  let service: FeedFetcherService;

  const mockSourcesService = {
    findOne: jest.fn(),
    updateLastChecked: jest.fn(),
    beginIngestionAttempt: jest.fn().mockResolvedValue({ id: 'attempt' }),
    recordIngestionSuccess: jest.fn(),
    recordIngestionFailure: jest.fn(),
  };
  const mockArticlesService = {
    findByUrlHash: jest.fn(),
    findByTitleHashInLastDays: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  };
  const mockQueueService = { addAnalyzeArticleJob: jest.fn() };
  const mockWebSourceFetcherService = { fetchSource: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockArticlesService.create.mockResolvedValue({ id: 'article-1' });

    service = new FeedFetcherService(
      mockSourcesService as any,
      mockArticlesService as any,
      mockQueueService as any,
      mockWebSourceFetcherService as any,
      { increment: jest.fn() } as any,
      { incrementStreams: jest.fn() } as any,
    );
  });

  describe('non-WEB source types (regression: rss-parser path must stay byte-for-byte unchanged)', () => {
    it('parses the feed, saves new articles, and queues fresh ones for analysis', async () => {
      const source = buildRssSource();
      mockSourcesService.findOne.mockResolvedValue(source);
      mockParseURL.mockResolvedValue({
        items: [
          {
            title: ' A Fresh Post ',
            link: 'https://example.com/fresh-post',
            isoDate: new Date().toISOString(),
            contentSnippet: 'summary',
            content: 'full content',
          },
        ],
      });
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue(null);

      await service.fetchSource(source.id);

      expect(mockArticlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: source.id,
          title: 'A Fresh Post',
          url: 'https://example.com/fresh-post',
          status: ArticleStatus.NEW,
        }),
      );
      expect(mockArticlesService.updateStatus).toHaveBeenCalledWith(
        'article-1',
        ArticleStatus.PENDING_ANALYSIS,
      );
      expect(mockQueueService.addAnalyzeArticleJob).toHaveBeenCalledWith('article-1');
      expect(mockSourcesService.updateLastChecked).toHaveBeenCalledWith(source.id);
      expect(mockWebSourceFetcherService.fetchSource).not.toHaveBeenCalled();
    });

    it('saves a title-duplicate item without queuing it for analysis', async () => {
      const source = buildRssSource();
      mockSourcesService.findOne.mockResolvedValue(source);
      mockParseURL.mockResolvedValue({
        items: [
          { title: 'Dup', link: 'https://example.com/dup', isoDate: new Date().toISOString() },
        ],
      });
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue({ id: 'earlier' });

      await service.fetchSource(source.id);

      expect(mockArticlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ArticleStatus.DUPLICATE }),
      );
      expect(mockArticlesService.updateStatus).not.toHaveBeenCalled();
      expect(mockQueueService.addAnalyzeArticleJob).not.toHaveBeenCalled();
    });

    it('saves an item older than the 78h analysis window without queuing it', async () => {
      const source = buildRssSource();
      mockSourcesService.findOne.mockResolvedValue(source);
      const oldDate = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
      mockParseURL.mockResolvedValue({
        items: [{ title: 'Old post', link: 'https://example.com/old', isoDate: oldDate }],
      });
      mockArticlesService.findByUrlHash.mockResolvedValue(null);
      mockArticlesService.findByTitleHashInLastDays.mockResolvedValue(null);

      await service.fetchSource(source.id);

      expect(mockArticlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ArticleStatus.NEW }),
      );
      expect(mockArticlesService.updateStatus).not.toHaveBeenCalled();
      expect(mockQueueService.addAnalyzeArticleJob).not.toHaveBeenCalled();
    });

    it('skips an item with neither link nor guid, and one with no title, without throwing', async () => {
      const source = buildRssSource();
      mockSourcesService.findOne.mockResolvedValue(source);
      mockParseURL.mockResolvedValue({
        items: [{ title: 'No link' }, { link: 'https://example.com/no-title' }],
      });

      await service.fetchSource(source.id);

      expect(mockArticlesService.create).not.toHaveBeenCalled();
      expect(mockSourcesService.updateLastChecked).toHaveBeenCalledWith(source.id);
    });

    it('logs and swallows the error when the feed itself fails to parse, without updating lastCheckedAt', async () => {
      const source = buildRssSource();
      mockSourcesService.findOne.mockResolvedValue(source);
      mockParseURL.mockRejectedValue(new Error('network down'));

      await expect(service.fetchSource(source.id)).rejects.toThrow('network down');

      expect(mockSourcesService.updateLastChecked).not.toHaveBeenCalled();
    });
  });

  describe('WEB source type branch', () => {
    it('delegates entirely to WebSourceFetcherService and never touches the rss-parser path', async () => {
      const source = buildWebSource();
      mockSourcesService.findOne.mockResolvedValue(source);

      await service.fetchSource(source.id);

      expect(mockWebSourceFetcherService.fetchSource).toHaveBeenCalledWith(source, [], 'attempt');
      expect(mockParseURL).not.toHaveBeenCalled();
      expect(mockArticlesService.create).not.toHaveBeenCalled();
    });
  });
});
