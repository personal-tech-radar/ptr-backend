/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { SourceStatus } from '../../sources/entities/source.entity';
import { IngestionScheduleService } from './ingestion-schedule.service';

describe('IngestionScheduleService', () => {
  const sourceQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const coverageRepo = { find: jest.fn() };
  const sourceRepo = { createQueryBuilder: jest.fn(() => sourceQb) };
  const streamRepo = { find: jest.fn().mockResolvedValue([]) };
  const service = new IngestionScheduleService(
    coverageRepo as any,
    sourceRepo as any,
    streamRepo as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    sourceQb.getMany.mockResolvedValue([]);
  });

  it('creates one prioritized ingestion job for a multi-stream source', async () => {
    coverageRepo.find.mockResolvedValue([
      {
        sourceId: 'source',
        contentStreamId: 'security-id',
        contentStream: { key: 'security' },
        source: { status: SourceStatus.ACTIVE, lastAttemptAt: null, lastSuccessfulFetchAt: null },
      },
      {
        sourceId: 'source',
        contentStreamId: 'experience-id',
        contentStream: { key: 'engineering_experience' },
        source: { status: SourceStatus.ACTIVE, lastAttemptAt: null, lastSuccessfulFetchAt: null },
      },
    ]);
    await expect(service.findDue()).resolves.toEqual([
      { sourceId: 'source', streamIds: ['security-id', 'experience-id'], priority: 1 },
    ]);
  });

  it('does not schedule a source before its shortest stream interval is due', async () => {
    coverageRepo.find.mockResolvedValue([
      {
        sourceId: 'source',
        contentStreamId: 'security-id',
        contentStream: { key: 'security' },
        source: { lastSuccessfulFetchAt: new Date('2026-07-31T11:30:00Z') },
      },
    ]);
    await expect(service.findDue(new Date('2026-07-31T12:00:00Z'))).resolves.toEqual([]);
  });
});
