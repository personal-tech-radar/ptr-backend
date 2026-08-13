import { FeedCacheService } from './feed-cache.service';
import { QueryFeedDto } from '../dto/query-feed.dto';

describe('FeedCacheService', () => {
  let service: FeedCacheService;

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const userId = 'user-1';
  const originalTtl = process.env.FEED_CACHE_TTL_SECONDS;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeedCacheService(
      mockRedisService as any,
      {} as any,
      {
        increment: jest.fn(),
      } as any,
    );
  });

  afterEach(() => {
    process.env.FEED_CACHE_TTL_SECONDS = originalTtl;
  });

  describe('buildKey', () => {
    it('produces the same key for identical filters given in a different param order', () => {
      const queryA: QueryFeedDto = { stream: ['a', 'b'], days: 7 } as QueryFeedDto;
      const queryB: QueryFeedDto = { stream: ['b', 'a'], days: 7 } as QueryFeedDto;

      const keyA = service.buildKey(userId, queryA, '2026-07-25', 7);
      const keyB = service.buildKey(userId, queryB, '2026-07-25', 7);

      expect(keyA).toBe(keyB);
    });

    it('produces different keys for different filters', () => {
      const queryA: QueryFeedDto = { stream: ['a'] } as QueryFeedDto;
      const queryB: QueryFeedDto = { stream: ['b'] } as QueryFeedDto;

      const keyA = service.buildKey(userId, queryA, '2026-07-25', 7);
      const keyB = service.buildKey(userId, queryB, '2026-07-25', 7);

      expect(keyA).not.toBe(keyB);
    });

    it('includes the userId, resolved beforeDate, and days in the key', () => {
      const key = service.buildKey(userId, {} as QueryFeedDto, '2026-07-25', 7);

      expect(key.startsWith('feed:user-1:')).toBe(true);
      expect(key.endsWith(':2026-07-25:7')).toBe(true);
    });
  });

  describe('get/set', () => {
    it('returns null on a cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.get('some-key');

      expect(result).toBeNull();
    });

    it('parses and returns the cached value on a hit', async () => {
      const cached = { days: [] };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.get('some-key');

      expect(result).toEqual(cached);
    });

    it('writes with the FEED_CACHE_TTL_SECONDS env var as TTL', async () => {
      process.env.FEED_CACHE_TTL_SECONDS = '300';
      const value = { days: [] };

      await service.set('some-key', value as any);

      expect(mockRedisService.set).toHaveBeenCalledWith('some-key', JSON.stringify(value), 300);
    });

    it('falls back to the 600s default TTL when the env var is unset', async () => {
      delete process.env.FEED_CACHE_TTL_SECONDS;
      const value = { days: [] };

      await service.set('some-key', value as any);

      expect(mockRedisService.set).toHaveBeenCalledWith('some-key', JSON.stringify(value), 600);
    });
  });
});
