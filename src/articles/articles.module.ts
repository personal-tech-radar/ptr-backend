import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesController } from './controllers/articles.controller';
import { Article } from './entities/article.entity';
import { ArticleFeedback } from './entities/article-feedback.entity';
import { ArticleFeedbackService } from './services/article-feedback.service';
import { ArticlesService } from './services/articles.service';

@Module({
  imports: [TypeOrmModule.forFeature([Article, ArticleFeedback])],
  controllers: [ArticlesController],
  providers: [ArticlesService, ArticleFeedbackService],
  exports: [ArticlesService, ArticleFeedbackService],
})
export class ArticlesModule {}
