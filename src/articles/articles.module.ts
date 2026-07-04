import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesController } from './controllers/articles.controller';
import { FeedbackClickController } from './controllers/feedback-click.controller';
import { Article } from './entities/article.entity';
import { ArticleFeedback } from './entities/article-feedback.entity';
import { SourcesModule } from '../sources/sources.module';
import { ArticleFeedbackService } from './services/article-feedback.service';
import { ArticlesService } from './services/articles.service';

@Module({
  imports: [TypeOrmModule.forFeature([Article, ArticleFeedback]), SourcesModule],
  controllers: [ArticlesController, FeedbackClickController],
  providers: [ArticlesService, ArticleFeedbackService],
  exports: [ArticlesService, ArticleFeedbackService],
})
export class ArticlesModule {}
