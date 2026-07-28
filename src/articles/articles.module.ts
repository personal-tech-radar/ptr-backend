import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminArticlesController } from './controllers/admin-articles.controller';
import { ArticlesController } from './controllers/articles.controller';
import { FeedbackClickController } from './controllers/feedback-click.controller';
import { Article } from './entities/article.entity';
import { ArticleFeedback } from './entities/article-feedback.entity';
import { SourcesModule } from '../sources/sources.module';
import { ArticleFeedbackService } from './services/article-feedback.service';
import { ArticlesService } from './services/articles.service';

@Module({
  // SourcesModule needs ArticlesService (SourceCandidatesService, for candidate promotion
  // sampling), so this import is circular — forwardRef here + on SourcesModule's side defers
  // resolution until both modules have finished registering.
  imports: [TypeOrmModule.forFeature([Article, ArticleFeedback]), forwardRef(() => SourcesModule)],
  controllers: [ArticlesController, AdminArticlesController, FeedbackClickController],
  providers: [ArticlesService, ArticleFeedbackService],
  exports: [ArticlesService, ArticleFeedbackService],
})
export class ArticlesModule {}
