import { DigestType } from '../entities/digest.entity';
import { DigestSweepService } from './digest-sweep.service';

describe('DigestSweepService', () => {
  const digestRepo = { exist: jest.fn().mockResolvedValue(false) };
  const users = { findEligibleForDigestSweep: jest.fn() };
  const queue = { addSendPersonalDigestJob: jest.fn() };
  const service = new DigestSweepService(digestRepo as any, users as any, queue as any);

  beforeEach(() => jest.clearAllMocks());

  afterEach(() => jest.useRealTimers());

  it('schedules daily at 09:00 local every day with a deterministic local period', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T07:00:00Z'));
    users.findEligibleForDigestSweep.mockResolvedValue([
      {
        id: 'user',
        timezone: 'Europe/Berlin',
        dailyDigestEnabled: true,
        weeklyDigestEnabled: false,
      },
    ]);
    await service.runSweep();
    expect(queue.addSendPersonalDigestJob).toHaveBeenCalledWith(
      'user',
      DigestType.DAILY,
      'daily:2026-08-01',
    );
  });

  it('schedules the daily digest on Sunday', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T07:00:00Z'));
    users.findEligibleForDigestSweep.mockResolvedValue([
      {
        id: 'sunday-user',
        timezone: 'Europe/Berlin',
        dailyDigestEnabled: true,
        weeklyDigestEnabled: false,
      },
    ]);
    await service.runSweep();
    expect(queue.addSendPersonalDigestJob).toHaveBeenCalledWith(
      'sunday-user',
      DigestType.DAILY,
      'daily:2026-08-02',
    );
  });

  it('schedules weekly only Friday at 14:00 local', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00Z'));
    users.findEligibleForDigestSweep.mockResolvedValue([
      {
        id: 'user',
        timezone: 'Europe/Berlin',
        dailyDigestEnabled: false,
        weeklyDigestEnabled: true,
      },
    ]);
    await service.runSweep();
    expect(queue.addSendPersonalDigestJob).toHaveBeenCalledWith(
      'user',
      DigestType.WEEKLY,
      'weekly:2026-07-31',
    );
  });

  it('does not enqueue an existing local period', async () => {
    digestRepo.exist.mockResolvedValueOnce(true);
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00Z'));
    users.findEligibleForDigestSweep.mockResolvedValue([
      {
        id: 'user',
        timezone: 'Europe/Berlin',
        dailyDigestEnabled: false,
        weeklyDigestEnabled: true,
      },
    ]);
    await service.runSweep();
    expect(queue.addSendPersonalDigestJob).not.toHaveBeenCalled();
  });
});
