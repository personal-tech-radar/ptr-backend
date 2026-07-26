import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from '../articles/articles.module';
import { QueueModule } from '../queue/queue.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { ContentStream } from '../taxonomy/entities/content-stream.entity';
import { ArticleAnalysisProcessor } from './processors/article-analysis.processor';
import { AiAnalysisService } from './services/ai-analysis.service';
import { ArticleAnalysis } from './entities/article-analysis.entity';
import { ArticleStream } from './entities/article-stream.entity';
import { ArticleTechnologyInterest } from './entities/article-technology-interest.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ArticleAnalysis,
      ArticleTechnologyInterest,
      ArticleStream,
      ContentStream,
    ]),
    ArticlesModule,
    QueueModule,
    TaxonomyModule,
  ],
  providers: [AiAnalysisService, ArticleAnalysisProcessor],
  exports: [AiAnalysisService, TypeOrmModule],
})
export class AiAnalysisModule {}
