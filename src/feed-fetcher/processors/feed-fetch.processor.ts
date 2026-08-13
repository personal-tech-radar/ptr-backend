import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggingService } from '../../common/logging/logging.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { QUEUE_FEED_FETCH } from '../../queue/services/queue.service';
import { FeedFetcherService } from '../services/feed-fetcher.service';

@Processor(QUEUE_FEED_FETCH)
export class FeedFetchProcessor extends WorkerHost {
  private readonly logger = new LoggingService(FeedFetchProcessor.name);

  constructor(
    private readonly feedFetcherService: FeedFetcherService,
    private readonly metricsService: MetricsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.metricsService.observeQueueLag(
      QUEUE_FEED_FETCH,
      Math.max(0, Date.now() - job.timestamp),
    );
    switch (job.name) {
      case 'fetch-source':
        await this.feedFetcherService.fetchSource(job.data.sourceId, job.data.streamIds ?? []);
        break;
      case 'cleanup-technical-history':
        await this.feedFetcherService.cleanupTechnicalHistory();
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
