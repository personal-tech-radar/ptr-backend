import { DigestType } from '../digest/entities/digest.entity';
import {
  PLAYWRIGHT_QUEUE_CONCURRENCY,
  QUEUE_ARTICLE_ANALYSIS,
  QUEUE_DIGEST,
  QUEUE_FEED_FETCH,
  QUEUE_TAXONOMY_SOURCE_DISCOVERY,
  QUEUE_WEB_SOURCE_BROWSER_FETCH,
  QueueService,
  TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY,
} from './queue.service';

describe('QueueService', () => {
  const mockFeedFetchQueue = { add: jest.fn() };
  const mockArticleAnalysisQueue = { add: jest.fn() };
  const mockDigestQueue = { add: jest.fn() };
  const mockWebSourceBrowserFetchQueue = { add: jest.fn() };
  const mockTaxonomySourceDiscoveryQueue = { add: jest.fn() };

  let service: QueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QueueService(
      mockFeedFetchQueue as any,
      mockArticleAnalysisQueue as any,
      mockDigestQueue as any,
      mockWebSourceBrowserFetchQueue as any,
      mockTaxonomySourceDiscoveryQueue as any,
    );
  });

  it('gives web-source-browser-fetch and taxonomy-source-discovery their own distinct queue names', () => {
    const names = [
      QUEUE_FEED_FETCH,
      QUEUE_ARTICLE_ANALYSIS,
      QUEUE_DIGEST,
      QUEUE_WEB_SOURCE_BROWSER_FETCH,
      QUEUE_TAXONOMY_SOURCE_DISCOVERY,
    ];
    expect(new Set(names).size).toBe(names.length);
    expect(QUEUE_WEB_SOURCE_BROWSER_FETCH).toBe('web-source-browser-fetch');
    expect(QUEUE_TAXONOMY_SOURCE_DISCOVERY).toBe('taxonomy-source-discovery');
  });

  it('reads TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY from its own env var, independently of the other queues', () => {
    expect(TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY).toBeGreaterThanOrEqual(1);
  });

  it('reads PLAYWRIGHT_QUEUE_CONCURRENCY from its own env var, independently of the other queues', () => {
    expect(PLAYWRIGHT_QUEUE_CONCURRENCY).toBeGreaterThanOrEqual(1);

    const originalEnv = process.env.PLAYWRIGHT_QUEUE_CONCURRENCY;
    process.env.PLAYWRIGHT_QUEUE_CONCURRENCY = '4';

    let reloaded: { PLAYWRIGHT_QUEUE_CONCURRENCY: number } | undefined;
    jest.isolateModules(() => {
      // The constant is computed once at module load, so re-requiring (not statically
      // importing) is the only way to observe a different env value taking effect — this is a
      // deliberate, narrow use of `require`, not a stylistic choice.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      reloaded = require('./queue.service') as { PLAYWRIGHT_QUEUE_CONCURRENCY: number };
    });

    expect(reloaded?.PLAYWRIGHT_QUEUE_CONCURRENCY).toBe(4);
    process.env.PLAYWRIGHT_QUEUE_CONCURRENCY = originalEnv;
  });

  it('enqueues a browser-fetch-source job onto only its own queue, never the other three', async () => {
    await service.addBrowserFetchSourceJob('source-1');

    expect(mockWebSourceBrowserFetchQueue.add).toHaveBeenCalledWith('browser-fetch-source', {
      sourceId: 'source-1',
    });
    expect(mockFeedFetchQueue.add).not.toHaveBeenCalled();
    expect(mockArticleAnalysisQueue.add).not.toHaveBeenCalled();
    expect(mockDigestQueue.add).not.toHaveBeenCalled();
    expect(mockTaxonomySourceDiscoveryQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues a discover-technology-source job onto only its own queue', async () => {
    await service.addTaxonomySourceDiscoveryJob('tech-1');

    expect(mockTaxonomySourceDiscoveryQueue.add).toHaveBeenCalledWith(
      'discover-technology-source',
      {
        technologyInterestId: 'tech-1',
      },
    );
    expect(mockFeedFetchQueue.add).not.toHaveBeenCalled();
    expect(mockArticleAnalysisQueue.add).not.toHaveBeenCalled();
    expect(mockDigestQueue.add).not.toHaveBeenCalled();
    expect(mockWebSourceBrowserFetchQueue.add).not.toHaveBeenCalled();
  });

  it('still enqueues fetch-all-sources onto feed-fetch only, unaffected by the new queue', async () => {
    await service.addFetchAllSourcesJob();

    expect(mockFeedFetchQueue.add).toHaveBeenCalledWith('fetch-all-sources', {});
    expect(mockWebSourceBrowserFetchQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues a digest-sweep job with no payload', async () => {
    await service.addDigestSweepJob();

    expect(mockDigestQueue.add).toHaveBeenCalledWith('digest-sweep', {});
  });

  it('enqueues a send-personal-digest job with userId and type', async () => {
    await service.addSendPersonalDigestJob('user-1', DigestType.DAILY);

    expect(mockDigestQueue.add).toHaveBeenCalledWith('send-personal-digest', {
      userId: 'user-1',
      type: DigestType.DAILY,
    });
  });
});
