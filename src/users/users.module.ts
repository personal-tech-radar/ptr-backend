import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedCacheModule } from '../feed/feed-cache.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { UsersController } from './controllers/users.controller';
import { User } from './entities/user.entity';
import { OnboardingService } from './services/onboarding.service';
import { UserCommandService } from './services/user-command.service';
import { UserQueryService } from './services/user-query.service';

@Module({
  // Only TaxonomyModule's exported services are consumed here (OnboardingService) — this
  // module never injects TaxonomyModule's repositories directly (see coder.md). FeedCacheModule
  // is the minimal leaf module (RedisService-backed invalidation only) — importing it here does
  // NOT pull in FeedModule (controller/query-service/taxonomy+scoring wiring), avoiding a
  // circular module dependency since FeedModule itself imports UsersModule.
  imports: [TypeOrmModule.forFeature([User]), TaxonomyModule, FeedCacheModule],
  controllers: [UsersController],
  providers: [UserCommandService, UserQueryService, OnboardingService],
  exports: [UserCommandService, UserQueryService],
})
export class UsersModule {}
