import { Module } from '@nestjs/common';
import { SourcesModule } from '../sources/sources.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { UsersModule } from '../users/users.module';
import { RelevanceScoringService } from './services/relevance-scoring.service';
import { UserScoringProfileService } from './services/user-scoring-profile.service';

// No controller — services-only, consumed by later phases (Personal Feed, Public Preview).
@Module({
  imports: [TaxonomyModule, UsersModule, SourcesModule],
  providers: [RelevanceScoringService, UserScoringProfileService],
  exports: [RelevanceScoringService, UserScoringProfileService],
})
export class ScoringModule {}
