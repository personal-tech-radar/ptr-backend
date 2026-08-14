import { PublicFeedStatisticsService } from './public-feed-statistics.service';
import { SourceStatus } from '../../sources/entities/source.entity';

describe('PublicFeedStatisticsService', () => {
  it('returns rolling pipeline counts and the preview selection count', async () => {
    const sourceRepo = { count: jest.fn().mockResolvedValue(540) };
    const articleRepo = { count: jest.fn().mockResolvedValue(5324) };
    const analysisRepo = { count: jest.fn().mockResolvedValue(3245) };
    const service = new PublicFeedStatisticsService(
      sourceRepo as any,
      articleRepo as any,
      analysisRepo as any,
    );

    await expect(service.get(256)).resolves.toMatchObject({
      period: 'Last 24h',
      activeSources: 540,
      articlesCollected: 5324,
      articlesAnalyzed: 3245,
      selectedForRadar: 256,
    });
    expect(sourceRepo.count).toHaveBeenCalledWith({ where: { status: SourceStatus.ACTIVE } });
  });

  it('uses null for selectedForRadar on the standalone endpoint', async () => {
    const service = new PublicFeedStatisticsService(
      { count: jest.fn().mockResolvedValue(1) } as any,
      { count: jest.fn().mockResolvedValue(2) } as any,
      { count: jest.fn().mockResolvedValue(3) } as any,
    );

    await expect(service.get()).resolves.toMatchObject({ selectedForRadar: null });
  });
});
