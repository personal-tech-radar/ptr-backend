import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggingService } from '../../common/logging/logging.service';
import { MailService } from '../../mail/services/mail.service';
import { QUEUE_DIGEST } from '../../queue/queue.service';
import { Digest } from '../entities/digest.entity';
import { DigestBuilderService } from '../services/digest-builder.service';
import { DigestQueryService } from '../services/digest-query.service';

@Processor(QUEUE_DIGEST)
export class DigestProcessor extends WorkerHost {
  private readonly logger = new LoggingService(DigestProcessor.name);

  constructor(
    private readonly digestBuilderService: DigestBuilderService,
    private readonly digestQueryService: DigestQueryService,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'build-daily-digest':
        await this.handleBuildAndSend(() =>
          this.digestBuilderService.buildDailyDigest(),
        );
        break;
      case 'build-weekly-digest':
        await this.handleBuildAndSend(() =>
          this.digestBuilderService.buildWeeklyDigest(),
        );
        break;
      case 'build-deep-dive-weekly-digest':
        await this.handleBuildAndSend(() =>
          this.digestBuilderService.buildDeepDiveWeeklyDigest(),
        );
        break;
      case 'send-daily-digest':
        await this.handleSend(job.data.digestId as string | undefined);
        break;
      default:
        this.logger.warn(`Unknown digest job: ${job.name}`);
    }
  }

  private async handleBuildAndSend(
    buildFn: () => Promise<Digest | null>,
  ): Promise<void> {
    const digest = await buildFn();
    if (!digest) {
      this.logger.info('No articles found, digest skipped');
      return;
    }
    await this.trySend(digest);
  }

  private async handleSend(digestId?: string): Promise<void> {
    const digest = digestId
      ? await this.digestQueryService.findById(digestId)
      : await this.digestQueryService.findLatestBuiltOrSent();
    await this.trySend(digest);
  }

  private async trySend(digest: Digest): Promise<void> {
    try {
      await this.mailService.sendDigest(digest);
      await this.digestQueryService.markSent(digest.id);
    } catch (err) {
      this.logger.error('Failed to send digest', err, { digestId: digest.id });
      await this.digestQueryService.markFailed(digest.id);
    }
  }
}
