import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggingService } from '../../common/logging/logging.service';
import { QUEUE_FEED_FETCH } from '../../queue/queue.service';
import { FeedFetcherService } from '../services/feed-fetcher.service';

@Processor(QUEUE_FEED_FETCH)
export class FeedFetchProcessor extends WorkerHost {
  private readonly logger = new LoggingService(FeedFetchProcessor.name);

  constructor(private readonly feedFetcherService: FeedFetcherService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'fetch-all-sources':
        await this.feedFetcherService.fetchAllSources();
        break;
      case 'fetch-source':
        await this.feedFetcherService.fetchSource(job.data.sourceId);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
