import { FeedCacheInvalidationService } from './feed-cache-invalidation.service';

describe('FeedCacheInvalidationService', () => {
  let service: FeedCacheInvalidationService;

  const mockRedisService = {
    incrementUser: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeedCacheInvalidationService(mockRedisService as any);
  });

  it('increments the user cache version', async () => {
    await service.invalidateForUser('user-1');
    expect(mockRedisService.incrementUser).toHaveBeenCalledWith('user-1');
  });
});
