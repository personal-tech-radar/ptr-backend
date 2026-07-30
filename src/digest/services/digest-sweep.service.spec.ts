import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DigestSweepService } from './digest-sweep.service';
import { Digest, DigestType } from '../entities/digest.entity';
import { UserQueryService } from '../../users/services/user-query.service';
import { QueueService } from '../../queue/queue.service';

describe('DigestSweepService', () => {
  let service: DigestSweepService;

  const mockDigestRepo = {
    count: jest.fn(),
  };

  const mockUserQueryService = {
    findEligibleForDigestSweep: jest.fn(),
  };

  const mockQueueService = {
    addSendPersonalDigestJob: jest.fn(),
  };

  const baseUser = {
    id: 'user-1',
    timezone: 'America/Los_Angeles',
    dailyDigestEnabled: true,
    weeklyDigestEnabled: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDigestRepo.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestSweepService,
        { provide: getRepositoryToken(Digest), useValue: mockDigestRepo },
        { provide: UserQueryService, useValue: mockUserQueryService },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get(DigestSweepService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // 2026-07-28T15:00:00Z is Tue 08:00 local in America/Los_Angeles (PDT, UTC-7) — inside the
  // default DAILY_DIGEST_SEND_HOUR=8 window — but Wed 00:00 local in Asia/Tokyo (UTC+9), well
  // outside it. Same real-world instant, two different per-user-local outcomes.
  const DAILY_WINDOW_INSTANT = '2026-07-28T15:00:00Z';

  it('fires the daily job when the user local time is within the send-hour window', async () => {
    jest.useFakeTimers().setSystemTime(new Date(DAILY_WINDOW_INSTANT));
    mockUserQueryService.findEligibleForDigestSweep.mockResolvedValue([
      { ...baseUser, weeklyDigestEnabled: false },
    ]);

    await service.runSweep();

    expect(mockQueueService.addSendPersonalDigestJob).toHaveBeenCalledWith(
      'user-1',
      DigestType.DAILY,
    );
  });

  it('does not fire the daily job for a user in a timezone where local time falls outside the window at the same instant', async () => {
    jest.useFakeTimers().setSystemTime(new Date(DAILY_WINDOW_INSTANT));
    mockUserQueryService.findEligibleForDigestSweep.mockResolvedValue([
      { ...baseUser, timezone: 'Asia/Tokyo' },
    ]);

    await service.runSweep();

    expect(mockQueueService.addSendPersonalDigestJob).not.toHaveBeenCalled();
  });

  // 2026-08-01T15:00:00Z is Sat 08:00 local in America/Los_Angeles — same local hour as the daily
  // window, but decision #2 explicitly restricts daily to Mon-Fri only.
  it('does not fire the daily job on a Saturday even when the local hour matches the send hour', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T15:00:00Z'));
    mockUserQueryService.findEligibleForDigestSweep.mockResolvedValue([
      { ...baseUser, weeklyDigestEnabled: false },
    ]);

    await service.runSweep();

    expect(mockQueueService.addSendPersonalDigestJob).not.toHaveBeenCalled();
  });

  // 2026-07-31T21:00:00Z is Fri 14:00 local in America/Los_Angeles — the fixed, hardcoded weekly
  // send window (decision #3).
  it('fires the weekly job at Friday 14:00 local, and only then', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T21:00:00Z'));
    mockUserQueryService.findEligibleForDigestSweep.mockResolvedValue([
      { ...baseUser, dailyDigestEnabled: false },
    ]);

    await service.runSweep();

    expect(mockQueueService.addSendPersonalDigestJob).toHaveBeenCalledWith(
      'user-1',
      DigestType.WEEKLY,
    );
  });

  it('does not fire the weekly job on a Friday outside the 14:00 local window', async () => {
    // Same instant as above but observed in UTC, where local time is Fri 21:00, not Fri 14:00.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T21:00:00Z'));
    mockUserQueryService.findEligibleForDigestSweep.mockResolvedValue([
      { ...baseUser, timezone: 'UTC', dailyDigestEnabled: false },
    ]);

    await service.runSweep();

    expect(mockQueueService.addSendPersonalDigestJob).not.toHaveBeenCalled();
  });

  it('skips a user for whom a digest of that type already exists for their local today (idempotency)', async () => {
    jest.useFakeTimers().setSystemTime(new Date(DAILY_WINDOW_INSTANT));
    mockUserQueryService.findEligibleForDigestSweep.mockResolvedValue([
      { ...baseUser, weeklyDigestEnabled: false },
    ]);
    mockDigestRepo.count.mockResolvedValue(1);

    await service.runSweep();

    expect(mockQueueService.addSendPersonalDigestJob).not.toHaveBeenCalled();
  });

  it('skips the daily job for a user with dailyDigestEnabled=false even inside the window', async () => {
    jest.useFakeTimers().setSystemTime(new Date(DAILY_WINDOW_INSTANT));
    mockUserQueryService.findEligibleForDigestSweep.mockResolvedValue([
      { ...baseUser, dailyDigestEnabled: false, weeklyDigestEnabled: false },
    ]);

    await service.runSweep();

    expect(mockQueueService.addSendPersonalDigestJob).not.toHaveBeenCalled();
  });
});
