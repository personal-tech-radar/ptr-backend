import { FeedCacheVersionService } from './feed-cache-version.service';

describe('FeedCacheVersionService', () => {
  const redis = { get: jest.fn(), incr: jest.fn() };
  const service = new FeedCacheVersionService(redis as any);

  beforeEach(() => jest.clearAllMocks());

  it('increments only unique completed streams', async () => {
    await service.incrementStreams(['security', 'security', 'releases']);
    expect(redis.incr).toHaveBeenCalledTimes(2);
    expect(redis.incr).toHaveBeenCalledWith('feed-cache-version:stream:security');
    expect(redis.incr).toHaveBeenCalledWith('feed-cache-version:stream:releases');
  });

  it('returns stable sorted versions for combined-cache keys', async () => {
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key.endsWith('security') ? '2' : '4'),
    );
    await expect(service.getStreamVersions(['security', 'releases'])).resolves.toEqual({
      releases: 4,
      security: 2,
    });
  });
});
