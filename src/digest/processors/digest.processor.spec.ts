// jsdom/@mozilla/readability are mocked at the module boundary, same as
// digest-bootstrap.service.spec.ts: jsdom v29's dependency tree is ESM-only several levels deep
// and isn't loadable under this project's Jest/ts-jest setup (pre-existing test-infra gap).
// DigestProcessor reaches jsdom transitively (via DigestBootstrapService's real import chain,
// used here purely as a DI token type), never calls it directly.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { DigestProcessor } from './digest.processor';
import { DigestType } from '../entities/digest.entity';

describe('DigestProcessor', () => {
  let processor: DigestProcessor;

  const mockDigestSweepService = { runSweep: jest.fn() };
  const mockDigestBootstrapService = {
    buildDailyDigest: jest.fn(),
    buildWeeklyDigest: jest.fn(),
  };
  const mockDigestQueryService = { markSent: jest.fn(), markFailed: jest.fn() };
  const mockUserQueryService = { findById: jest.fn() };
  const mockMailService = { sendDigest: jest.fn() };

  const user = { id: 'user-1', email: 'user@example.com' };
  const digest = { id: 'digest-1', subject: 'Subject' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserQueryService.findById.mockResolvedValue(user);

    processor = new DigestProcessor(
      mockDigestSweepService as any,
      mockDigestBootstrapService as any,
      mockDigestQueryService as any,
      mockUserQueryService as any,
      mockMailService as any,
    );
  });

  it('runs the sweep for a digest-sweep job', async () => {
    await processor.process({ name: 'digest-sweep', data: {} } as any);

    expect(mockDigestSweepService.runSweep).toHaveBeenCalledTimes(1);
  });

  it('builds the daily digest, sends it, and marks it sent for a send-personal-digest daily job', async () => {
    mockDigestBootstrapService.buildDailyDigest.mockResolvedValue(digest);

    await processor.process({
      name: 'send-personal-digest',
      data: { userId: 'user-1', type: DigestType.DAILY },
    } as any);

    expect(mockDigestBootstrapService.buildDailyDigest).toHaveBeenCalledWith('user-1');
    expect(mockMailService.sendDigest).toHaveBeenCalledWith(digest, user.email);
    expect(mockDigestQueryService.markSent).toHaveBeenCalledWith('digest-1');
  });

  it('builds the weekly digest for a send-personal-digest weekly job', async () => {
    mockDigestBootstrapService.buildWeeklyDigest.mockResolvedValue(digest);

    await processor.process({
      name: 'send-personal-digest',
      data: { userId: 'user-1', type: DigestType.WEEKLY },
    } as any);

    expect(mockDigestBootstrapService.buildWeeklyDigest).toHaveBeenCalledWith('user-1');
    expect(mockMailService.sendDigest).toHaveBeenCalledWith(digest, user.email);
  });

  it('sends nothing and marks nothing when the builder returns null (no eligible candidates)', async () => {
    mockDigestBootstrapService.buildDailyDigest.mockResolvedValue(null);

    await processor.process({
      name: 'send-personal-digest',
      data: { userId: 'user-1', type: DigestType.DAILY },
    } as any);

    expect(mockMailService.sendDigest).not.toHaveBeenCalled();
    expect(mockDigestQueryService.markSent).not.toHaveBeenCalled();
  });

  it('marks the digest failed when sending throws', async () => {
    mockDigestBootstrapService.buildDailyDigest.mockResolvedValue(digest);
    mockMailService.sendDigest.mockRejectedValue(new Error('send failed'));

    await processor.process({
      name: 'send-personal-digest',
      data: { userId: 'user-1', type: DigestType.DAILY },
    } as any);

    expect(mockDigestQueryService.markFailed).toHaveBeenCalledWith('digest-1');
  });

  it('warns and does nothing for an unknown job name', async () => {
    await processor.process({ name: 'unknown-job', data: {} } as any);

    expect(mockDigestSweepService.runSweep).not.toHaveBeenCalled();
    expect(mockDigestBootstrapService.buildDailyDigest).not.toHaveBeenCalled();
  });
});
