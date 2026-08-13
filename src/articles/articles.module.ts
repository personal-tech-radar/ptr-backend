import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminArticleFeedbackController } from './controllers/admin-article-feedback.controller';
import { AdminArticlesController } from './controllers/admin-articles.controller';
import { ArticlesController } from './controllers/articles.controller';
import { Article } from './entities/article.entity';
import { ArticleFeedback } from './entities/article-feedback.entity';
import { SourcesModule } from '../sources/sources.module';
import { ArticleFeedbackService } from './services/article-feedback.service';
import { ArticlesService } from './services/articles.service';
import { QueueModule } from '../queue/queue.module';
import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../ai-analysis/entities/article-technology-interest.entity';
import { PublicArticlesService } from './services/public-articles.service';
import { ArticleAnalysisRetryService } from './services/article-analysis-retry.service';

@Module({
  // SourcesModule needs ArticlesService (SourceCandidatesService, for candidate promotion
  // sampling), so this import is circular — forwardRef here + on SourcesModule's side defers
  // resolution until both modules have finished registering.
  imports: [
    TypeOrmModule.forFeature([
      Article,
      ArticleFeedback,
      ArticleAnalysis,
      ArticleStream,
      ArticleTechnologyInterest,
    ]),
    forwardRef(() => SourcesModule),
    QueueModule,
  ],
  controllers: [ArticlesController, AdminArticlesController, AdminArticleFeedbackController],
  providers: [
    ArticlesService,
    ArticleFeedbackService,
    PublicArticlesService,
    ArticleAnalysisRetryService,
  ],
  exports: [ArticlesService, ArticleFeedbackService, PublicArticlesService],
})
export class ArticlesModule {}
