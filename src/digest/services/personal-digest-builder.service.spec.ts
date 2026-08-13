import { DigestStatus, DigestType } from '../entities/digest.entity';
import { PersonalDigestBuilderService } from './personal-digest-builder.service';

describe('PersonalDigestBuilderService', () => {
  const qb = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const digestRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve({ ...value, id: 'digest' })),
  };
  const metrics = { increment: jest.fn() };
  let service: PersonalDigestBuilderService;

  beforeEach(() => {
    jest.clearAllMocks();
    qb.getMany.mockResolvedValue([]);
    digestRepo.findOne.mockResolvedValue(null);
    service = new PersonalDigestBuilderService(
      { createQueryBuilder: jest.fn(() => qb), count: jest.fn().mockResolvedValue(0) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { count: jest.fn().mockResolvedValue(0) } as any,
      { count: jest.fn().mockResolvedValue(0) } as any,
      { count: jest.fn().mockResolvedValue(0) } as any,
      {
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ sources: '0', publications: '0' }),
        })),
      } as any,
      digestRepo as any,
      { create: jest.fn(), save: jest.fn() } as any,
      { create: jest.fn(), save: jest.fn() } as any,
      { buildProfile: jest.fn() } as any,
      { computeScore: jest.fn() } as any,
      { findOrCreateLinksBatch: jest.fn() } as any,
      { findOrCreate: jest.fn() } as any,
      { generateIntro: jest.fn() } as any,
      { renderHtml: jest.fn(), renderText: jest.fn() } as any,
      metrics as any,
    );
  });

  it('persists skipped_empty and does not render email when the period has no candidates', async () => {
    const digest = await service.buildForUser(
      { id: 'user', timezone: 'Europe/Berlin' } as any,
      DigestType.DAILY,
      'daily:2026-07-31',
    );
    expect(digest.status).toBe(DigestStatus.SKIPPED_EMPTY);
    expect(digest.periodKey).toBe('daily:2026-07-31');
    expect(metrics.increment).toHaveBeenCalledWith('digests_total', {
      outcome: 'skipped_empty',
      type: DigestType.DAILY,
    });
  });

  it('returns the existing digest for the same user, type, and local period', async () => {
    const existing = { id: 'existing', status: DigestStatus.DRAFT };
    digestRepo.findOne.mockResolvedValueOnce(existing);
    await expect(
      service.buildForUser(
        { id: 'user', timezone: 'UTC' } as any,
        DigestType.WEEKLY,
        'weekly:2026-07-31',
      ),
    ).resolves.toBe(existing);
    expect(digestRepo.save).not.toHaveBeenCalled();
  });
});
