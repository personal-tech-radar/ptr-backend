import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import {
  getLocalDateString,
  getLocalTimeParts,
  LocalTimeParts,
  zonedEndOfDayExclusiveUTC,
  zonedStartOfDayUTC,
} from '../../common/util/timezone.util';
import { QueueService } from '../../queue/queue.service';
import { User } from '../../users/entities/user.entity';
import { UserQueryService } from '../../users/services/user-query.service';
import { Digest, DigestType } from '../entities/digest.entity';

// MVP3 Phase 10 decision #2: daily cadence is Mon-Fri ONLY, per-user local time — NOT every day.
const DAILY_DIGEST_WEEKDAYS: LocalTimeParts['weekday'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAILY_DIGEST_SEND_HOUR = parseInt(process.env.DAILY_DIGEST_SEND_HOUR || '8', 10);

// MVP3 Phase 10 decision #3: fixed Friday 14:00 local per user — hardcoded, not configurable.
const WEEKLY_DIGEST_WEEKDAY: LocalTimeParts['weekday'] = 'Fri';
const WEEKLY_DIGEST_SEND_HOUR = 14;

// Both windows are [hour:00, hour:15) local — must be wider than the sweep's own cadence
// (DIGEST_SWEEP_CRON, default */15 * * * *) so a sweep tick landing anywhere inside the window
// still catches it, without ever spanning into the next hour.
const SEND_WINDOW_MINUTES = 15;

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
      const parts = getLocalTimeParts(now, user.timezone);

      if (user.dailyDigestEnabled && this.isInDailyWindow(parts)) {
        await this.maybeEnqueue(user, DigestType.DAILY, now);
      }

      if (user.weeklyDigestEnabled && this.isInWeeklyWindow(parts)) {
        await this.maybeEnqueue(user, DigestType.WEEKLY, now);
      }
    }
  }

  private isInDailyWindow(parts: LocalTimeParts): boolean {
    return (
      DAILY_DIGEST_WEEKDAYS.includes(parts.weekday) &&
      parts.hour === DAILY_DIGEST_SEND_HOUR &&
      parts.minute < SEND_WINDOW_MINUTES
    );
  }

  private isInWeeklyWindow(parts: LocalTimeParts): boolean {
    return (
      parts.weekday === WEEKLY_DIGEST_WEEKDAY &&
      parts.hour === WEEKLY_DIGEST_SEND_HOUR &&
      parts.minute < SEND_WINDOW_MINUTES
    );
  }

  private async maybeEnqueue(user: User, type: DigestType, now: Date): Promise<void> {
    const alreadySent = await this.hasDigestForLocalToday(user, type, now);
    if (alreadySent) {
      return;
    }

    await this.queueService.addSendPersonalDigestJob(user.id, type);
    this.logger.info('Enqueued send-personal-digest job', { userId: user.id, type });
  }

  // Idempotency guard: skip if a Digest of this type already exists for the user's current local
  // calendar day. Scoped to an indexed (userId, type, createdAt) range rather than a full table
  // scan — see Digest's composite index.
  private async hasDigestForLocalToday(user: User, type: DigestType, now: Date): Promise<boolean> {
    const dateStr = getLocalDateString(now, user.timezone);
    const start = zonedStartOfDayUTC(dateStr, user.timezone);
    const end = zonedEndOfDayExclusiveUTC(dateStr, user.timezone);

    const count = await this.digestRepo.count({
      where: { userId: user.id, type, createdAt: Between(start, end) },
    });

    return count > 0;
  }
}
