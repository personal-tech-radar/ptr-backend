import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../ai-analysis/entities/article-technology-interest.entity';
import { Article } from '../articles/entities/article.entity';
import { ScoringModule } from '../scoring/scoring.module';
import { Source } from '../sources/entities/source.entity';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { SavedArticle } from '../user-actions/entities/saved-article.entity';
import { UserActionsModule } from '../user-actions/user-actions.module';
import { UsersModule } from '../users/users.module';
import { FeedController } from './controllers/feed.controller';
import { FeedCacheModule } from './feed-cache.module';
import { OnboardingCompletedGuard } from './guards/onboarding-completed.guard';
import { FeedCacheService } from './services/feed-cache.service';
import { FeedQueryService } from './services/feed-query.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Article,
      ArticleAnalysis,
      ArticleStream,
      ArticleTechnologyInterest,
      Source,
      SavedArticle,
    ]),
    ScoringModule,
    TaxonomyModule,
    UsersModule,
    UserActionsModule,
    FeedCacheModule,
  ],
  controllers: [FeedController],
  providers: [FeedQueryService, FeedCacheService, OnboardingCompletedGuard],
})
export class FeedModule {}
