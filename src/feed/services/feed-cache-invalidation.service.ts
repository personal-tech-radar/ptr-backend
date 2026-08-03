import { Injectable } from '@nestjs/common';
import { LoggingService } from '../../common/logging/logging.service';
import { FeedCacheVersionService } from './feed-cache-version.service';

export const FEED_CACHE_KEY_PREFIX = 'feed';

@Injectable()
export class FeedCacheInvalidationService {
  private readonly logger = new LoggingService(FeedCacheInvalidationService.name);

  constructor(private readonly versionService: FeedCacheVersionService) {}

  async invalidateForUser(userId: string): Promise<void> {
    await this.versionService.incrementUser(userId);
    this.logger.info('Feed cache user version incremented', { userId });
  }
}
