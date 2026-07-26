import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticleFeedback } from '../articles/entities/article-feedback.entity';
import { SourcesModule } from '../sources/sources.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { UsersModule } from '../users/users.module';
import { RelevanceScoringService } from './services/relevance-scoring.service';
import { UserScoringProfileService } from './services/user-scoring-profile.service';

// No controller — services-only, consumed by later phases (Personal Feed, Public Preview).
@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleFeedback]),
    TaxonomyModule,
    UsersModule,
    SourcesModule,
  ],
  providers: [RelevanceScoringService, UserScoringProfileService],
  exports: [RelevanceScoringService, UserScoringProfileService],
})
export class ScoringModule {}
