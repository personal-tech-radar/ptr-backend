import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import {
  getLocalDateString,
  getLocalTimeParts,
  LocalTimeParts,
} from '../../common/util/timezone.util';
import { QueueService } from '../../queue/services/queue.service';
import { User } from '../../users/entities/user.entity';
import { UserQueryService } from '../../users/services/user-query.service';
import { Digest, DigestType } from '../entities/digest.entity';

// Daily delivery is due every calendar day at 09:00 in the user's timezone.
const DAILY_DIGEST_SEND_HOUR = 9;

// MVP3 Phase 10 decision #3: fixed Friday 14:00 local per user — hardcoded, not configurable.
const WEEKLY_DIGEST_WEEKDAY: LocalTimeParts['weekday'] = 'Fri';
const WEEKLY_DIGEST_SEND_HOUR = 14;

// Both windows match the unified scheduler's five-minute cadence.
const SEND_WINDOW_MINUTES = 5;

@Injectable()
export class DigestSweepService {
  private readonly logger = new LoggingService(DigestSweepService.name);

  constructor(
    @InjectRepository(Digest)
    private readonly digestRepo: Repository<Digest>,
    private readonly userQueryService: UserQueryService,
    private readonly queueService: QueueService,
  ) {}

  async runSweep(): Promise<void> {
    const now = new Date();
    const users = await this.userQueryService.findEligibleForDigestSweep();

    for (const user of users) {
      const timezone = user.timezone!;
      const parts = getLocalTimeParts(now, timezone);

      if (user.dailyDigestEnabled && this.isInDailyWindow(parts)) {
        await this.maybeEnqueue(user, DigestType.DAILY, now, timezone);
      }

      if (user.weeklyDigestEnabled && this.isInWeeklyWindow(parts)) {
        await this.maybeEnqueue(user, DigestType.WEEKLY, now, timezone);
      }
    }
  }

  private isInDailyWindow(parts: LocalTimeParts): boolean {
    return parts.hour === DAILY_DIGEST_SEND_HOUR && parts.minute < SEND_WINDOW_MINUTES;
  }

  private isInWeeklyWindow(parts: LocalTimeParts): boolean {
    return (
      parts.weekday === WEEKLY_DIGEST_WEEKDAY &&
      parts.hour === WEEKLY_DIGEST_SEND_HOUR &&
      parts.minute < SEND_WINDOW_MINUTES
    );
  }

  private async maybeEnqueue(
    user: User,
    type: DigestType,
    now: Date,
    timezone: string,
  ): Promise<void> {
    const periodKey = `${type}:${getLocalDateString(now, timezone)}`;
    const alreadySent = await this.digestRepo.exist({
      where: { userId: user.id, type, periodKey },
    });
    if (alreadySent) {
      return;
    }

    await this.queueService.addSendPersonalDigestJob(user.id, type, periodKey);
    this.logger.info('Enqueued send-personal-digest job', { userId: user.id, type });
  }
}
