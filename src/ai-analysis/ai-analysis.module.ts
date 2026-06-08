import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from '../articles/articles.module';
import { QueueModule } from '../queue/queue.module';
import { ArticleAnalysisProcessor } from './processors/article-analysis.processor';
import { AiAnalysisService } from './services/ai-analysis.service';
import { ArticleAnalysis } from './entities/article-analysis.entity';
import { ArticleRelevance } from './entities/article-relevance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleAnalysis, ArticleRelevance]),
    ArticlesModule,
    QueueModule,
  ],
  providers: [AiAnalysisService, ArticleAnalysisProcessor],
  exports: [AiAnalysisService, TypeOrmModule],
})
export class AiAnalysisModule {}
