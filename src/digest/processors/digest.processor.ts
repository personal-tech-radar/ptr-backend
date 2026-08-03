import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggingService } from '../../common/logging/logging.service';
import { MailService } from '../../mail/services/mail.service';
import { DIGEST_QUEUE_CONCURRENCY, QUEUE_DIGEST } from '../../queue/services/queue.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { Digest, DigestDeliveryMode, DigestType } from '../entities/digest.entity';
import { DigestStatus } from '../entities/digest.entity';
import { MetricsService } from '../../common/metrics/metrics.service';
import { DigestBootstrapService } from '../services/digest-bootstrap.service';
import { DigestQueryService } from '../services/digest-query.service';
import { DigestSweepService } from '../services/digest-sweep.service';

interface SendPersonalDigestJobData {
  userId: string;
  type: DigestType;
  periodKey?: string;
}

interface ResendDigestJobData {
  digestId: string;
}

@Processor(QUEUE_DIGEST, { concurrency: DIGEST_QUEUE_CONCURRENCY })
export class DigestProcessor extends WorkerHost {
  private readonly logger = new LoggingService(DigestProcessor.name);

  constructor(
    private readonly digestSweepService: DigestSweepService,
    private readonly digestBootstrapService: DigestBootstrapService,
    private readonly digestQueryService: DigestQueryService,
    private readonly userQueryService: UserQueryService,
    private readonly mailService: MailService,
    private readonly metricsService: MetricsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.metricsService.observeQueueLag(
      QUEUE_DIGEST,
      Math.max(0, Date.now() - job.timestamp),
    );
    switch (job.name) {
      case 'digest-sweep':
        await this.digestSweepService.runSweep();
        break;
      case 'send-personal-digest':
        await this.handleSendPersonalDigest(job.data as SendPersonalDigestJobData);
        break;
      case 'resend-digest':
        await this.handleResend(String((job.data as ResendDigestJobData).digestId));
        break;
      default:
        this.logger.warn(`Unknown digest job: ${job.name}`);
    }
  }

  private async handleSendPersonalDigest(data: SendPersonalDigestJobData): Promise<void> {
    const { userId, type, periodKey } = data;
    const user = await this.userQueryService.findById(userId);

    const digest =
      type === DigestType.DAILY
        ? await this.digestBootstrapService.buildDailyDigest(userId, periodKey)
        : await this.digestBootstrapService.buildWeeklyDigest(userId, periodKey);

    if (digest.status === DigestStatus.SKIPPED_EMPTY) {
      this.logger.info('No candidates found, personal digest skipped', { userId, type });
      return;
    }

    await this.trySend(digest, user.email);
  }

  private async trySend(digest: Digest, to: string): Promise<void> {
    try {
      await this.mailService.sendDigest(digest, to);
      await this.digestQueryService.markSent(digest.id);
      await this.metricsService.increment('digests_total', { outcome: 'sent', type: digest.type });
    } catch (err) {
      this.logger.error('Failed to send digest', err, { digestId: digest.id });
      await this.digestQueryService.markFailed(digest.id);
      await this.metricsService.increment('digests_total', {
        outcome: 'failed',
        type: digest.type,
      });
      throw err;
    }
  }

  private async handleResend(digestId: string): Promise<void> {
    const digest = await this.digestQueryService.findByIdWithItems(digestId);
    if (digest.status === DigestStatus.SKIPPED_EMPTY) return;
    const recipient =
      digest.deliveryMode === DigestDeliveryMode.ADMIN_PREVIEW
        ? digest.actualRecipientEmail
        : digest.user?.email;
    if (!recipient) return;
    await this.trySend(digest, recipient);
  }
}
