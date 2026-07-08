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

// Consumed by PlaywrightFetchProcessor's `@Processor(..., { concurrency })` worker options —
// this is the first queue in the project that needs an explicit per-queue concurrency ceiling,
// so the constant lives alongside the queue name it configures rather than being wired ad hoc.
export const PLAYWRIGHT_QUEUE_CONCURRENCY = parseInt(
  process.env.PLAYWRIGHT_QUEUE_CONCURRENCY || '1',
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
}
