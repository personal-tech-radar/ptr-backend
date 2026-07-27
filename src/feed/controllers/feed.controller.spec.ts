import { FeedController } from './feed.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserRole } from '../../users/entities/user.entity';
import { QueryFeedDto } from '../dto/query-feed.dto';
import { OnboardingCompletedGuard } from '../guards/onboarding-completed.guard';

describe('FeedController', () => {
  let controller: FeedController;

  const mockFeedQueryService = { getFeed: jest.fn() };
  const mockFeedCacheService = { buildKey: jest.fn(), get: jest.fn(), set: jest.fn() };

  const user = {
    id: 'user-1',
    email: 'jane@example.com',
    role: UserRole.USER,
    onboardingCompletedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FeedController(mockFeedQueryService as any, mockFeedCacheService as any);
  });

  it('returns the cached response on a cache hit without calling FeedQueryService', async () => {
    const cached = { days: [] };
    mockFeedCacheService.buildKey.mockReturnValue('cache-key');
    mockFeedCacheService.get.mockResolvedValue(cached);

    const result = await controller.getFeed(user, {} as QueryFeedDto);

    expect(result).toBe(cached);
    expect(mockFeedQueryService.getFeed).not.toHaveBeenCalled();
  });

  it('computes, caches, and returns the feed on a cache miss', async () => {
    const computed = { days: [{ date: '2026-07-25', articles: [] }] };
    mockFeedCacheService.buildKey.mockReturnValue('cache-key');
    mockFeedCacheService.get.mockResolvedValue(null);
    mockFeedQueryService.getFeed.mockResolvedValue(computed);

    const result = await controller.getFeed(user, {} as QueryFeedDto);

    expect(mockFeedQueryService.getFeed).toHaveBeenCalledWith(user.id, {});
    expect(mockFeedCacheService.set).toHaveBeenCalledWith('cache-key', computed);
    expect(result).toBe(computed);
  });

  it('applies JwtAuthGuard before OnboardingCompletedGuard', () => {
    const guards = Reflect.getMetadata('__guards__', FeedController);

    expect(guards).toEqual([JwtAuthGuard, OnboardingCompletedGuard]);
  });
});
