import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggingService } from '../../common/logging/logging.service';
import {
  PLAYWRIGHT_QUEUE_CONCURRENCY,
  QUEUE_WEB_SOURCE_BROWSER_FETCH,
} from '../../queue/queue.service';
import { getPlaywrightTimeoutMs } from '../../sources/services/playwright-fetch.service';
import { SourcesService } from '../../sources/services/sources.service';
import { WebSourceFetcherService } from '../services/web-source-fetcher.service';

// Padding on top of PLAYWRIGHT_TIMEOUT_MS: the navigation timeout inside PlaywrightFetchService
// already bounds `page.goto`, but this is a backstop for the surrounding work (browser launch,
// context teardown) so a single job can never hang this worker indefinitely.
const JOB_TIMEOUT_BUFFER_MS = 5000;

@Processor(QUEUE_WEB_SOURCE_BROWSER_FETCH, { concurrency: PLAYWRIGHT_QUEUE_CONCURRENCY })
export class PlaywrightFetchProcessor extends WorkerHost {
  private readonly logger = new LoggingService(PlaywrightFetchProcessor.name);

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly webSourceFetcherService: WebSourceFetcherService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'browser-fetch-source') {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const timeoutMs = getPlaywrightTimeoutMs() + JOB_TIMEOUT_BUFFER_MS;
    await this.withHardTimeout(this.runJob(job.data.sourceId), timeoutMs, job.data.sourceId);
  }

  private async runJob(sourceId: string): Promise<void> {
    const source = await this.sourcesService.findOne(sourceId);
    await this.webSourceFetcherService.fetchSourceViaBrowser(source);
  }

  private withHardTimeout<T>(promise: Promise<T>, timeoutMs: number, sourceId: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`Browser fetch job for source ${sourceId} timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err as Error);
        });
    });
  }
}
