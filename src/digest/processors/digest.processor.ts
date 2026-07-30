import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggingService } from '../../common/logging/logging.service';
import { MailService } from '../../mail/services/mail.service';
import { DIGEST_QUEUE_CONCURRENCY, QUEUE_DIGEST } from '../../queue/queue.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { Digest, DigestType } from '../entities/digest.entity';
import { DigestBootstrapService } from '../services/digest-bootstrap.service';
import { DigestQueryService } from '../services/digest-query.service';
import { DigestSweepService } from '../services/digest-sweep.service';

interface SendPersonalDigestJobData {
  userId: string;
  type: DigestType;
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
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'digest-sweep':
        await this.digestSweepService.runSweep();
        break;
      case 'send-personal-digest':
        await this.handleSendPersonalDigest(job.data as SendPersonalDigestJobData);
        break;
      default:
        this.logger.warn(`Unknown digest job: ${job.name}`);
    }
  }

  private async handleSendPersonalDigest(data: SendPersonalDigestJobData): Promise<void> {
    const { userId, type } = data;
    const user = await this.userQueryService.findById(userId);

    const digest =
      type === DigestType.DAILY
        ? await this.digestBootstrapService.buildDailyDigest(userId)
        : await this.digestBootstrapService.buildWeeklyDigest(userId);

    if (!digest) {
      this.logger.info('No candidates found, personal digest skipped', { userId, type });
      return;
    }

    await this.trySend(digest, user.email);
  }

  private async trySend(digest: Digest, to: string): Promise<void> {
    try {
      await this.mailService.sendDigest(digest, to);
      await this.digestQueryService.markSent(digest.id);
    } catch (err) {
      this.logger.error('Failed to send digest', err, { digestId: digest.id });
      await this.digestQueryService.markFailed(digest.id);
    }
  }
}
