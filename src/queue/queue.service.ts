import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export const QUEUE_FEED_FETCH = 'feed-fetch';
export const QUEUE_ARTICLE_ANALYSIS = 'article-analysis';
export const QUEUE_DIGEST = 'digest';
// Isolated from the other three queues on purpose: a Playwright browser fetch can hang far
// longer than a normal HTTP/RSS fetch, and must never occupy the feed-fetch/article-analysis
// workers while it does. Its own queue means its own BullMQ Worker/event loop task, so a stuck
// job here cannot block those other queues from making progress.
export const QUEUE_WEB_SOURCE_BROWSER_FETCH = 'web-source-browser-fetch';
// Isolated from the other queues for the same reason as web-source-browser-fetch above: a
// future real web-search integration (this phase only ships a stub processor that records the
// request) could hang or run long, and must never occupy the feed-fetch/article-analysis/digest
// workers while it does.
export const QUEUE_TAXONOMY_SOURCE_DISCOVERY = 'taxonomy-source-discovery';

// Consumed by PlaywrightFetchProcessor's `@Processor(..., { concurrency })` worker options —
// this is the first queue in the project that needs an explicit per-queue concurrency ceiling,
// so the constant lives alongside the queue name it configures rather than being wired ad hoc.
export const PLAYWRIGHT_QUEUE_CONCURRENCY = parseInt(
  process.env.PLAYWRIGHT_QUEUE_CONCURRENCY || '1',
  10,
);

// Consumed by TaxonomySourceDiscoveryProcessor's `@Processor(..., { concurrency })` worker
// options, mirroring PLAYWRIGHT_QUEUE_CONCURRENCY above.
export const TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY = parseInt(
  process.env.TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY || '2',
  10,
);

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QUEUE_FEED_FETCH) private readonly feedFetchQueue: Queue,
    @InjectQueue(QUEUE_ARTICLE_ANALYSIS)
    private readonly articleAnalysisQueue: Queue,
    @InjectQueue(QUEUE_DIGEST) private readonly digestQueue: Queue,
    @InjectQueue(QUEUE_WEB_SOURCE_BROWSER_FETCH)
    private readonly webSourceBrowserFetchQueue: Queue,
    @InjectQueue(QUEUE_TAXONOMY_SOURCE_DISCOVERY)
    private readonly taxonomySourceDiscoveryQueue: Queue,
  ) {}

  async addFetchAllSourcesJob(): Promise<void> {
    await this.feedFetchQueue.add('fetch-all-sources', {});
  }

  async addFetchSourceJob(sourceId: string): Promise<void> {
    await this.feedFetchQueue.add('fetch-source', { sourceId });
  }

  async addAnalyzeArticleJob(articleId: string): Promise<void> {
    await this.articleAnalysisQueue.add('analyze-article', { articleId });
  }

  async addBuildDailyDigestJob(): Promise<void> {
    await this.digestQueue.add('build-daily-digest', {});
  }

  async addBuildWeeklyDigestJob(): Promise<void> {
    await this.digestQueue.add('build-weekly-digest', {});
  }

  async addBuildDeepDiveWeeklyDigestJob(): Promise<void> {
    await this.digestQueue.add('build-deep-dive-weekly-digest', {});
  }

  async addSendDailyDigestJob(digestId: string): Promise<void> {
    await this.digestQueue.add('send-daily-digest', { digestId });
  }

  async addBrowserFetchSourceJob(sourceId: string): Promise<void> {
    await this.webSourceBrowserFetchQueue.add('browser-fetch-source', { sourceId });
  }

  async addTaxonomySourceDiscoveryJob(technologyInterestId: string): Promise<void> {
    await this.taxonomySourceDiscoveryQueue.add('discover-technology-source', {
      technologyInterestId,
    });
  }
}
