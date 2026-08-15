import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../ai-analysis/entities/article-technology-interest.entity';
import { Article } from '../articles/entities/article.entity';
import { Source } from '../sources/entities/source.entity';
import { ScoringModule } from '../scoring/scoring.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { FeedCacheModule } from '../feed/feed-cache.module';
import { PublicFeedController } from './controllers/public-feed.controller';
import { PublicFeedCacheService } from './services/public-feed-cache.service';
import { PublicFeedPreviewService } from './services/public-feed-preview.service';
import { PublicFeedQueryService } from './services/public-feed-query.service';
import { PublicFeedStatisticsService } from './services/public-feed-statistics.service';
import { ArticlesModule } from '../articles/articles.module';

// Deliberately does NOT import UsersModule/UserActionsModule — nothing here touches users or
// per-user actions (fully anonymous). Does NOT use UserScoringProfileService — the preview
// endpoint builds its ScoringProfile directly from request input.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ArticleAnalysis,
      ArticleStream,
      ArticleTechnologyInterest,
      Article,
      Source,
    ]),
    ScoringModule,
    TaxonomyModule,
    FeedCacheModule,
    ArticlesModule,
  ],
  controllers: [PublicFeedController],
  providers: [
    PublicFeedQueryService,
    PublicFeedPreviewService,
    PublicFeedCacheService,
    PublicFeedStatisticsService,
  ],
  exports: [PublicFeedStatisticsService],
})
export class PublicFeedModule {}
