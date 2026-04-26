import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export const QUEUE_FEED_FETCH = 'feed-fetch';
export const QUEUE_ARTICLE_ANALYSIS = 'article-analysis';
export const QUEUE_DIGEST = 'digest';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QUEUE_FEED_FETCH) private readonly feedFetchQueue: Queue,
    @InjectQueue(QUEUE_ARTICLE_ANALYSIS)
    private readonly articleAnalysisQueue: Queue,
    @InjectQueue(QUEUE_DIGEST) private readonly digestQueue: Queue,
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
}
