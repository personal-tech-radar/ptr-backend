import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from '../articles/articles.module';
import { FeedCacheModule } from '../feed/feed-cache.module';
import { SourcesModule } from '../sources/sources.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { AdminUsersController } from './controllers/admin-users.controller';
import { UsersController } from './controllers/users.controller';
import { User } from './entities/user.entity';
import { LegacyUserSyncService } from './services/legacy-user-sync.service';
import { OnboardingService } from './services/onboarding.service';
import { UserCommandService } from './services/user-command.service';
import { UserQueryService } from './services/user-query.service';

@Module({
  // Only TaxonomyModule's exported services are consumed here (OnboardingService,
  // LegacyUserSyncService) — this module never injects TaxonomyModule's repositories directly
  // (see coder.md). Same rule for ArticlesModule/SourcesModule, added in MVP3 Phase 11 solely for
  // LegacyUserSyncService's one-off ArticleFeedback/UserSourcePreference retag — only their
  // exported ArticleFeedbackService/UserSourcePreferenceService are consumed, never their
  // repositories. Neither module imports UsersModule back, so this isn't circular.
  // FeedCacheModule is the minimal leaf module (RedisService-backed invalidation only) —
  // importing it here does NOT pull in FeedModule (controller/query-service/taxonomy+scoring
  // wiring), avoiding a circular module dependency since FeedModule itself imports UsersModule.
  imports: [
    TypeOrmModule.forFeature([User]),
    TaxonomyModule,
    FeedCacheModule,
    ArticlesModule,
    SourcesModule,
  ],
  controllers: [UsersController, AdminUsersController],
  providers: [UserCommandService, UserQueryService, OnboardingService, LegacyUserSyncService],
  exports: [UserCommandService, UserQueryService, LegacyUserSyncService],
})
export class UsersModule {}
