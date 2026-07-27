import { Injectable } from '@nestjs/common';
import { LoggingService } from '../../common/logging/logging.service';
import { RedisService } from '../../common/redis/redis.service';

export const FEED_CACHE_KEY_PREFIX = 'feed';

@Injectable()
export class FeedCacheInvalidationService {
  private readonly logger = new LoggingService(FeedCacheInvalidationService.name);

  constructor(private readonly redisService: RedisService) {}

  async invalidateForUser(userId: string): Promise<void> {
    const deletedCount = await this.redisService.delByPattern(
      `${FEED_CACHE_KEY_PREFIX}:${userId}:*`,
    );
    this.logger.info('Feed cache invalidated for user', { userId, deletedCount });
  }
}
