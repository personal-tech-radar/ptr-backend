import { FeedCacheInvalidationService } from './feed-cache-invalidation.service';

describe('FeedCacheInvalidationService', () => {
  let service: FeedCacheInvalidationService;

  const mockRedisService = {
    delByPattern: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeedCacheInvalidationService(mockRedisService as any);
  });

  it('delegates to RedisService.delByPattern with the feed:{userId}:* prefix', async () => {
    mockRedisService.delByPattern.mockResolvedValue(3);

    await service.invalidateForUser('user-1');

    expect(mockRedisService.delByPattern).toHaveBeenCalledWith('feed:user-1:*');
  });
});
