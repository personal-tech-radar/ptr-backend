import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Queue, Job, JobType } from 'bullmq';
import { AdminJobResponseDto, AdminJobState, AdminQueueSummaryDto } from '../dto/admin-jobs.dto';
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
    return this.listAdminJobs(queueName, 'failed', page, limit);
  }

  async getAdminQueueSummary(): Promise<AdminQueueSummaryDto[]> {
    return Promise.all(
      this.queueEntries().map(
        async ([queue, instance]) =>
          ({
            queue,
            ...(await instance.getJobCounts(
              'waiting',
              'active',
              'delayed',
              'paused',
              'prioritized',
              'failed',
            )),
          }) as AdminQueueSummaryDto,
      ),
    );
  }

  async listAdminJobs(queueName?: string, state?: AdminJobState, page = 1, limit = 20) {
    if (queueName && !this.queueEntries().some(([name]) => name === queueName))
      throw new BadRequestException('Unknown queue');
    const states: AdminJobState[] = state
      ? [state]
      : ['waiting', 'active', 'delayed', 'paused', 'prioritized', 'failed'];
    const partitions = await Promise.all(
      this.queueEntries()
        .filter(([name]) => !queueName || name === queueName)
        .map(async ([name, queue]) => {
          const counts = await queue.getJobCounts(
            ...states.map((s) => (s === 'waiting' ? 'wait' : s)),
          );
          return { name, queue, counts };
        }),
    );
    const total = partitions.reduce(
      (n, p) => n + Object.values(p.counts).reduce((sum, count) => sum + count, 0),
      0,
    );
    let offset = (page - 1) * limit;
    const data: AdminJobResponseDto[] = [];
    // Stable queue/state order, with BullMQ's native order inside each state.
    for (const { name, queue, counts } of partitions) {
      for (const current of states) {
        const native: JobType = current === 'waiting' ? 'wait' : current;
        const count = counts[native] ?? 0;
        if (offset >= count) {
          offset -= count;
          continue;
        }
        const jobs = await queue.getJobs([native], offset, offset + limit - data.length - 1, false);
        const paused = await queue.isPaused();
        data.push(
          ...(await Promise.all(
            jobs.filter(Boolean).map((job) => this.toAdminJob(name, job, paused)),
          )),
        );
        offset = 0;
        if (data.length >= limit) break;
      }
      if (data.length >= limit) break;
    }
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getAdminJob(queueName: string, jobId: string): Promise<AdminJobResponseDto> {
    const queue = this.queueEntries().find(([name]) => name === queueName)?.[1];
    if (!queue) throw new NotFoundException('Queue not found');
    const job = await queue.getJob(jobId);
    if (!job) throw new NotFoundException('Queue job not found');
    return this.toAdminJob(queueName, job, await queue.isPaused());
  }

  private async toAdminJob(queue: string, job: Job, paused: boolean): Promise<AdminJobResponseDto> {
    const state = await job.getState();
    return {
      queue,
      id: String(job.id),
      type: job.name,
      name: job.name,
      state: state === 'waiting' && paused ? 'paused' : state,
      timestamp: job.timestamp,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
      attemptsMade: job.attemptsMade,
      attempts: job.opts.attempts ?? 1,
      failedReason: this.safeFailure(job.failedReason),
      reference: this.referenceForJob(job.data as Record<string, unknown>),
    };
  }

  private safeFailure(reason: string | undefined): string | null {
    if (!reason) return null;
    let safe = reason;
    for (const [key, value] of Object.entries(process.env)) {
      if (/(SECRET|PASSWORD|TOKEN|API_KEY)/i.test(key) && value && value.length >= 6)
        safe = safe.split(value).join('[redacted]');
    }
    return safe
      .replace(/(?:sk-|re_)[A-Za-z0-9_-]{8,}/g, '[redacted]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@');
  }

  private referenceForJob(data: Record<string, unknown>): { type: string; id: string } | null {
    for (const [key, type] of Object.entries({
      sourceId: 'source',
      articleId: 'article',
      candidateId: 'candidate',
      technologyInterestId: 'taxonomy',
      digestId: 'digest',
      userId: 'user',
    })) {
      const id = data[key];
      if (
        typeof id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      )
        return { type, id };
    }
    return null;
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
