import { PublicFeedCacheService } from './public-feed-cache.service';
import { QueryPublicFeedDto } from '../dto/query-public-feed.dto';

describe('PublicFeedCacheService', () => {
  let service: PublicFeedCacheService;

  const mockRedisService = { get: jest.fn(), set: jest.fn() };
  const originalTtl = process.env.PUBLIC_FEED_CACHE_TTL_SECONDS;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PublicFeedCacheService(mockRedisService as any);
  });

  afterEach(() => {
    process.env.PUBLIC_FEED_CACHE_TTL_SECONDS = originalTtl;
  });

  describe('buildListKey', () => {
    it('produces the same key for identical filters given in a different param order', () => {
      const queryA: QueryPublicFeedDto = { stream: ['a', 'b'], page: 1 } as QueryPublicFeedDto;
      const queryB: QueryPublicFeedDto = { stream: ['b', 'a'], page: 1 } as QueryPublicFeedDto;

      expect(service.buildListKey(queryA)).toBe(service.buildListKey(queryB));
    });

    it('produces different keys for different filters', () => {
      const queryA: QueryPublicFeedDto = { stream: ['a'] } as QueryPublicFeedDto;
      const queryB: QueryPublicFeedDto = { stream: ['b'] } as QueryPublicFeedDto;

      expect(service.buildListKey(queryA)).not.toBe(service.buildListKey(queryB));
    });

    it("uses the public-feed:list: prefix, distinct from FeedCacheService's feed: prefix", () => {
      const key = service.buildListKey({} as QueryPublicFeedDto);

      expect(key.startsWith('public-feed:list:')).toBe(true);
    });
  });

  describe('buildPreviewKey', () => {
    it('produces the same key for identical id sets given in a different order', () => {
      const keyA = service.buildPreviewKey(['ti-1', 'ti-2'], ['cs-1']);
      const keyB = service.buildPreviewKey(['ti-2', 'ti-1'], ['cs-1']);

      expect(keyA).toBe(keyB);
    });

    it('produces different keys for different id sets', () => {
      const keyA = service.buildPreviewKey(['ti-1'], ['cs-1']);
      const keyB = service.buildPreviewKey(['ti-2'], ['cs-1']);

      expect(keyA).not.toBe(keyB);
    });

    it('uses the public-feed:preview: prefix', () => {
      const key = service.buildPreviewKey([], ['cs-1']);

      expect(key.startsWith('public-feed:preview:')).toBe(true);
    });
  });

  describe('get/set', () => {
    it('writes with the PUBLIC_FEED_CACHE_TTL_SECONDS env var as TTL', async () => {
      process.env.PUBLIC_FEED_CACHE_TTL_SECONDS = '300';
      const value = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };

      await service.setList('some-key', value as any);

      expect(mockRedisService.set).toHaveBeenCalledWith('some-key', JSON.stringify(value), 300);
    });

    it('falls back to the 600s default TTL when the env var is unset', async () => {
      delete process.env.PUBLIC_FEED_CACHE_TTL_SECONDS;
      const value = { data: [] };

      await service.setPreview('some-key', value as any);

      expect(mockRedisService.set).toHaveBeenCalledWith('some-key', JSON.stringify(value), 600);
    });

    it('returns null on a cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);

      expect(await service.getList('some-key')).toBeNull();
      expect(await service.getPreview('some-key')).toBeNull();
    });

    it('parses and returns the cached value on a hit', async () => {
      const cached = { data: [] };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cached));

      expect(await service.getPreview('some-key')).toEqual(cached);
    });
  });
});
