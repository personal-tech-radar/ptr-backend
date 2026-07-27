import { Module } from '@nestjs/common';
import { FeedCacheInvalidationService } from './services/feed-cache-invalidation.service';

// Intentionally minimal leaf module — imports nothing feed-specific beyond RedisService (global,
// no import needed). Exists so UsersModule/ArticlesModule/SourcesModule can invalidate the feed
// cache from their own write paths without importing the rest of FeedModule (controller,
// query/cache services, taxonomy/scoring wiring) — that direction would be a circular/needless
// module dependency for those modules.
@Module({
  providers: [FeedCacheInvalidationService],
  exports: [FeedCacheInvalidationService],
})
export class FeedCacheModule {}
