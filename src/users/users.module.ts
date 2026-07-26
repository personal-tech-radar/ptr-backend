import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { UsersController } from './controllers/users.controller';
import { User } from './entities/user.entity';
import { OnboardingService } from './services/onboarding.service';
import { UserCommandService } from './services/user-command.service';
import { UserQueryService } from './services/user-query.service';

@Module({
  // Only TaxonomyModule's exported services are consumed here (OnboardingService) — this
  // module never injects TaxonomyModule's repositories directly (see coder.md).
  imports: [TypeOrmModule.forFeature([User]), TaxonomyModule],
  controllers: [UsersController],
  providers: [UserCommandService, UserQueryService, OnboardingService],
  exports: [UserCommandService, UserQueryService],
})
export class UsersModule {}
