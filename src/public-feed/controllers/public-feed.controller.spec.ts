import { PublicFeedController } from './public-feed.controller';
import { PreviewFeedDto } from '../dto/preview-feed.dto';
import { QueryPublicFeedDto } from '../dto/query-public-feed.dto';

describe('PublicFeedController', () => {
  let controller: PublicFeedController;

  const mockPublicFeedQueryService = { getFeed: jest.fn() };
  const mockPublicFeedPreviewService = { preview: jest.fn() };
  const mockPublicFeedCacheService = {
    buildListKey: jest.fn(),
    getList: jest.fn(),
    setList: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PublicFeedController(
      mockPublicFeedQueryService as any,
      mockPublicFeedPreviewService as any,
      mockPublicFeedCacheService as any,
    );
  });

  describe('GET /public/feed', () => {
    it('returns the cached response on a cache hit without calling PublicFeedQueryService', async () => {
      const cached = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      mockPublicFeedCacheService.buildListKey.mockReturnValue('cache-key');
      mockPublicFeedCacheService.getList.mockResolvedValue(cached);

      const result = await controller.getFeed({} as QueryPublicFeedDto);

      expect(result).toBe(cached);
      expect(mockPublicFeedQueryService.getFeed).not.toHaveBeenCalled();
    });

    it('computes, caches, and returns the feed on a cache miss', async () => {
      const computed = { data: [{ articleId: 'a1' }], meta: {} };
      mockPublicFeedCacheService.buildListKey.mockReturnValue('cache-key');
      mockPublicFeedCacheService.getList.mockResolvedValue(null);
      mockPublicFeedQueryService.getFeed.mockResolvedValue(computed);

      const query = { page: 1 } as QueryPublicFeedDto;
      const result = await controller.getFeed(query);

      expect(mockPublicFeedQueryService.getFeed).toHaveBeenCalledWith(query);
      expect(mockPublicFeedCacheService.setList).toHaveBeenCalledWith('cache-key', computed);
      expect(result).toBe(computed);
    });
  });

  describe('POST /public/feed/preview', () => {
    it('delegates directly to PublicFeedPreviewService.preview (caching is handled internally there)', async () => {
      const dto: PreviewFeedDto = { contentStreamIds: ['cs-1'] };
      const computed = { data: [] };
      mockPublicFeedPreviewService.preview.mockResolvedValue(computed);

      const result = await controller.preview(dto);

      expect(mockPublicFeedPreviewService.preview).toHaveBeenCalledWith(dto);
      expect(result).toBe(computed);
    });
  });

  describe('no guards applied', () => {
    it('has no route guards on the controller — fully public', () => {
      const guards = Reflect.getMetadata('__guards__', PublicFeedController);

      expect(guards).toBeUndefined();
    });
  });
});
