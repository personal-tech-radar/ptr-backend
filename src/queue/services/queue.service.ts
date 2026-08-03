import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DigestType } from '../../digest/entities/digest.entity';

export const QUEUE_FEED_FETCH = 'feed-fetch';
export const QUEUE_ARTICLE_ANALYSIS = 'article-analysis';
export const QUEUE_DIGEST = 'digest';
// Isolated browser work prevents hangs from blocking normal queues.
export const QUEUE_WEB_SOURCE_BROWSER_FETCH = 'web-source-browser-fetch';
// Taxonomy discovery has its own worker pool.
export const QUEUE_TAXONOMY_SOURCE_DISCOVERY = 'taxonomy-source-discovery';

// Bound browser-worker concurrency.
export const PLAYWRIGHT_QUEUE_CONCURRENCY = parseInt(
  process.env.PLAYWRIGHT_QUEUE_CONCURRENCY || '1',
  10,
);

// Bound taxonomy-discovery concurrency.
export const TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY = parseInt(
  process.env.TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY || '2',
  10,
);

export interface PreparedArticleAnalysisRetry {
  jobId: string;
  created: boolean;
  state: string;
}

export type PreparedTaxonomyDiscoveryRetry = PreparedArticleAnalysisRetry;

// Bound digest fan-out across persistence, scoring, and mail delivery.
export const DIGEST_QUEUE_CONCURRENCY = parseInt(process.env.DIGEST_QUEUE_CONCURRENCY || '5', 10);

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

  async addFetchSourceJob(
    sourceId: string,
    streamIds: string[] = [],
    priority = 4,
    bucket = Math.floor(Date.now() / 300_000),
  ): Promise<void> {
    await this.feedFetchQueue.add(
      'fetch-source',
      { sourceId, streamIds },
      { jobId: `source-${sourceId}-${bucket}`, priority },
    );
  }

  async addAnalyzeArticleJob(articleId: string): Promise<void> {
    await this.articleAnalysisQueue.add(
      'analyze-article',
      { articleId },
      { jobId: `article-${articleId}` },
    );
  }

  async prepareAnalyzeArticleRetry(articleId: string): Promise<PreparedArticleAnalysisRetry> {
    const jobId = `article-${articleId}`;
    const retained = await this.articleAnalysisQueue.getJob(jobId);
    if (retained) {
      const state = await retained.getState();
      if (['completed', 'failed'].includes(state)) {
        await retained.remove();
      } else {
        return { jobId, created: false, state };
      }
    }

    const job = await this.articleAnalysisQueue.add(
      'analyze-article',
      { articleId },
      // Delay until the PostgreSQL retry state is committed.
      { jobId, delay: 30_000 },
    );
    return { jobId: String(job.id), created: true, state: 'delayed' };
  }

  async activatePreparedArticleAnalysisRetry(jobId: string): Promise<void> {
    const job = await this.articleAnalysisQueue.getJob(jobId);
    if (!job) throw new Error(`Prepared article-analysis job ${jobId} is missing`);
    if ((await job.getState()) === 'delayed') await job.promote();
  }

  async compensatePreparedArticleAnalysisRetry(jobId: string): Promise<void> {
    const job = await this.articleAnalysisQueue.getJob(jobId);
    if (!job) return;
    const state = await job.getState();
    if (['waiting', 'delayed', 'paused', 'prioritized'].includes(state)) {
      await job.remove();
    }
  }

  async hasArticleAnalysisRetryJob(jobId: string): Promise<boolean> {
    return Boolean(await this.articleAnalysisQueue.getJob(jobId));
  }

  async addDigestSweepJob(bucket = Math.floor(Date.now() / 300_000)): Promise<void> {
    await this.digestQueue.add('digest-sweep', {}, { jobId: `digest-sweep-${bucket}` });
  }

  async addSendPersonalDigestJob(
    userId: string,
    type: DigestType,
    periodKey?: string,
  ): Promise<void> {
    const safePeriodKey = periodKey?.replace(/[^a-zA-Z0-9_-]/g, '-');
    const jobId = `digest-${userId}-${type}-${safePeriodKey ?? Math.floor(Date.now() / 300_000)}`;
    const retained = await this.digestQueue.getJob(jobId);
    if (retained && ['completed', 'failed'].includes(await retained.getState())) {
      await retained.remove();
    }
    await this.digestQueue.add('send-personal-digest', { userId, type, periodKey }, { jobId });
  }

  async addBrowserFetchSourceJob(
    sourceId: string,
    streamIds: string[] = [],
    attemptId?: string,
  ): Promise<void> {
    await this.webSourceBrowserFetchQueue.add(
      'browser-fetch-source',
      { sourceId, streamIds, attemptId },
      {
        jobId: `browser-source-${sourceId}-${Math.floor(Date.now() / 300_000)}`,
      },
    );
  }

  async addTaxonomySourceDiscoveryJob(
    technologyInterestId: string,
    userId?: string,
  ): Promise<void> {
    await this.taxonomySourceDiscoveryQueue.add(
      'discover-taxonomy-sources',
      { technologyInterestId, userId },
      { jobId: `taxonomy-${technologyInterestId}` },
    );
  }

  async prepareTaxonomySourceDiscoveryRetry(
    technologyInterestId: string,
    userId?: string,
  ): Promise<PreparedTaxonomyDiscoveryRetry> {
    const jobId = `taxonomy-${technologyInterestId}`;
    const retained = await this.taxonomySourceDiscoveryQueue.getJob(jobId);
    if (retained) {
      const state = await retained.getState();
      if (['completed', 'failed'].includes(state)) {
        await retained.remove();
      } else {
        return { jobId, created: false, state };
      }
    }
    const job = await this.taxonomySourceDiscoveryQueue.add(
      'discover-taxonomy-sources',
      { technologyInterestId, userId },
      { jobId, delay: 30_000 },
    );
    return { jobId: String(job.id), created: true, state: 'delayed' };
  }

  async activatePreparedTaxonomySourceDiscoveryRetry(jobId: string): Promise<void> {
    const job = await this.taxonomySourceDiscoveryQueue.getJob(jobId);
    if (!job) throw new Error(`Prepared taxonomy-discovery job ${jobId} is missing`);
    if ((await job.getState()) === 'delayed') await job.promote();
  }

  async compensatePreparedTaxonomySourceDiscoveryRetry(jobId: string): Promise<void> {
    const job = await this.taxonomySourceDiscoveryQueue.getJob(jobId);
    if (!job) return;
    const state = await job.getState();
    if (['waiting', 'delayed', 'paused', 'prioritized'].includes(state)) await job.remove();
  }

  async hasTaxonomySourceDiscoveryRetryJob(jobId: string): Promise<boolean> {
    return Boolean(await this.taxonomySourceDiscoveryQueue.getJob(jobId));
  }

  async addProcessSourceCandidateJob(candidateId: string): Promise<void> {
    await this.taxonomySourceDiscoveryQueue.add(
      'process-source-candidate',
      { candidateId },
      { jobId: `candidate-${candidateId}` },
    );
  }

  async addTechnicalHistoryCleanupJob(bucket = Math.floor(Date.now() / 300_000)): Promise<void> {
    await this.feedFetchQueue.add(
      'cleanup-technical-history',
      {},
      { jobId: `technical-cleanup-${bucket}` },
    );
  }

  async addResendDigestJob(digestId: string): Promise<void> {
    await this.digestQueue.add(
      'resend-digest',
      { digestId },
      { jobId: `resend-${digestId}-${Date.now()}` },
    );
  }

  async listFailedJobs(queueName?: string, page = 1, limit = 20) {
    const queues = this.queueEntries().filter(([name]) => !queueName || name === queueName);
    const start = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
    const end = start + Math.min(100, Math.max(1, limit)) - 1;
    const data = (
      await Promise.all(
        queues.map(async ([name, queue]) =>
          (await queue.getFailed(start, end)).map((job) => ({
            queue: name,
            id: job.id,
            name: job.name,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
          })),
        ),
      )
    ).flat();
    return { data, meta: { page, limit, total: data.length, totalPages: data.length ? page : 0 } };
  }

  async cancelPendingJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.queueEntries().find(([name]) => name === queueName)?.[1];
    if (!queue) return false;
    const job = await queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (!['waiting', 'delayed', 'paused', 'prioritized'].includes(state)) return false;
    await job.remove();
    return true;
  }

  private queueEntries(): Array<[string, Queue]> {
    return [
      [QUEUE_FEED_FETCH, this.feedFetchQueue],
      [QUEUE_ARTICLE_ANALYSIS, this.articleAnalysisQueue],
      [QUEUE_DIGEST, this.digestQueue],
      [QUEUE_WEB_SOURCE_BROWSER_FETCH, this.webSourceBrowserFetchQueue],
      [QUEUE_TAXONOMY_SOURCE_DISCOVERY, this.taxonomySourceDiscoveryQueue],
    ];
  }
}
