/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { DigestType } from '../../digest/entities/digest.entity';
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
  const mockArticleAnalysisQueue = { add: jest.fn(), getJob: jest.fn() };
  const mockDigestQueue = { add: jest.fn(), getJob: jest.fn() };
  const mockWebSourceBrowserFetchQueue = { add: jest.fn() };
  const mockTaxonomySourceDiscoveryQueue = { add: jest.fn(), getJob: jest.fn() };

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
    mockArticleAnalysisQueue.getJob.mockResolvedValue(null);
    mockArticleAnalysisQueue.add.mockResolvedValue({ id: 'article-article-1' });
    mockDigestQueue.getJob.mockResolvedValue(null);
    mockTaxonomySourceDiscoveryQueue.getJob.mockResolvedValue(null);
    mockTaxonomySourceDiscoveryQueue.add.mockResolvedValue({ id: 'taxonomy-tech-1' });
  });

  it.each(['completed', 'failed'])(
    'removes a retained %s analysis job before retrying',
    async (state) => {
      const remove = jest.fn();
      mockArticleAnalysisQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue(state),
        remove,
      });

      const result = await service.prepareAnalyzeArticleRetry('article-1');

      expect(remove).toHaveBeenCalled();
      expect(mockArticleAnalysisQueue.add).toHaveBeenCalledWith(
        'analyze-article',
        { articleId: 'article-1' },
        { jobId: 'article-article-1', delay: 30_000 },
      );
      expect(result.created).toBe(true);
    },
  );

  it('reuses retained executable analysis work for repeated retries', async () => {
    mockArticleAnalysisQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('waiting'),
    });

    await expect(service.prepareAnalyzeArticleRetry('article-1')).resolves.toEqual({
      jobId: 'article-article-1',
      created: false,
      state: 'waiting',
    });
    expect(mockArticleAnalysisQueue.add).not.toHaveBeenCalled();
  });

  it('promotes a prepared delayed analysis retry for immediate worker execution', async () => {
    const promote = jest.fn();
    mockArticleAnalysisQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('delayed'),
      promote,
    });

    await service.activatePreparedArticleAnalysisRetry('article-article-1');

    expect(promote).toHaveBeenCalled();
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

    expect(mockWebSourceBrowserFetchQueue.add).toHaveBeenCalledWith(
      'browser-fetch-source',
      { sourceId: 'source-1', streamIds: [], attemptId: undefined },
      expect.objectContaining({ jobId: expect.stringContaining('browser-source-source-1-') }),
    );
    expect(mockFeedFetchQueue.add).not.toHaveBeenCalled();
    expect(mockArticleAnalysisQueue.add).not.toHaveBeenCalled();
    expect(mockDigestQueue.add).not.toHaveBeenCalled();
    expect(mockTaxonomySourceDiscoveryQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues a discover-technology-source job onto only its own queue', async () => {
    await service.addTaxonomySourceDiscoveryJob('tech-1');

    expect(mockTaxonomySourceDiscoveryQueue.add).toHaveBeenCalledWith(
      'discover-taxonomy-sources',
      {
        technologyInterestId: 'tech-1',
        userId: undefined,
      },
      { jobId: 'taxonomy-tech-1' },
    );
    expect(mockFeedFetchQueue.add).not.toHaveBeenCalled();
    expect(mockArticleAnalysisQueue.add).not.toHaveBeenCalled();
    expect(mockDigestQueue.add).not.toHaveBeenCalled();
    expect(mockWebSourceBrowserFetchQueue.add).not.toHaveBeenCalled();
  });

  it.each(['completed', 'failed'])(
    'removes retained %s taxonomy discovery history before retrying',
    async (state) => {
      const remove = jest.fn();
      mockTaxonomySourceDiscoveryQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue(state),
        remove,
      });

      await expect(service.prepareTaxonomySourceDiscoveryRetry('tech-1')).resolves.toEqual({
        jobId: 'taxonomy-tech-1',
        created: true,
        state: 'delayed',
      });
      expect(remove).toHaveBeenCalled();
      expect(mockTaxonomySourceDiscoveryQueue.add).toHaveBeenCalledWith(
        'discover-taxonomy-sources',
        { technologyInterestId: 'tech-1', userId: undefined },
        { jobId: 'taxonomy-tech-1', delay: 30_000 },
      );
    },
  );

  it('reuses executable taxonomy discovery work for repeated retry requests', async () => {
    mockTaxonomySourceDiscoveryQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
    });

    await expect(service.prepareTaxonomySourceDiscoveryRetry('tech-1')).resolves.toEqual({
      jobId: 'taxonomy-tech-1',
      created: false,
      state: 'active',
    });
    expect(mockTaxonomySourceDiscoveryQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues a digest-sweep job with no payload', async () => {
    await service.addDigestSweepJob();

    expect(mockDigestQueue.add).toHaveBeenCalledWith(
      'digest-sweep',
      {},
      expect.objectContaining({ jobId: expect.stringContaining('digest-sweep-') }),
    );
  });

  it('enqueues a send-personal-digest job with userId and type', async () => {
    await service.addSendPersonalDigestJob('user-1', DigestType.DAILY);

    expect(mockDigestQueue.add).toHaveBeenCalledWith(
      'send-personal-digest',
      { userId: 'user-1', type: DigestType.DAILY, periodKey: undefined },
      expect.objectContaining({ jobId: expect.stringContaining('digest-user-1-daily-') }),
    );
  });

  it('keeps the logical period in payload while sanitizing the BullMQ job ID', async () => {
    await service.addSendPersonalDigestJob('user-1', DigestType.DAILY, 'daily:2026-08-03');

    expect(mockDigestQueue.add).toHaveBeenCalledWith(
      'send-personal-digest',
      { userId: 'user-1', type: DigestType.DAILY, periodKey: 'daily:2026-08-03' },
      { jobId: 'digest-user-1-daily-daily-2026-08-03' },
    );
  });

  it.each(['completed', 'failed'])('replaces retained %s digest work', async (state) => {
    const remove = jest.fn();
    mockDigestQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue(state),
      remove,
    });

    await service.addSendPersonalDigestJob('user-1', DigestType.DAILY, 'daily:2026-08-03');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(mockDigestQueue.add).toHaveBeenCalledTimes(1);
  });
});
