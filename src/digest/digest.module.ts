import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { ArticlesModule } from '../articles/articles.module';
import { FeedFetcherModule } from '../feed-fetcher/feed-fetcher.module';
import { MailModule } from '../mail/mail.module';
import { QueueModule } from '../queue/queue.module';
import { SourcesModule } from '../sources/sources.module';
import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';
import { ArticleRelevance } from '../ai-analysis/entities/article-relevance.entity';
import { Article } from '../articles/entities/article.entity';
import { SourceCandidate } from '../sources/entities/source-candidate.entity';
import { Source } from '../sources/entities/source.entity';
import { DigestController } from './controllers/digest.controller';
import { DigestItem } from './entities/digest-item.entity';
import { Digest } from './entities/digest.entity';
import { DigestProcessor } from './processors/digest.processor';
import { AiDigestService } from './services/ai-digest.service';
import { DigestBootstrapService } from './services/digest-bootstrap.service';
import { DigestBuilderService } from './services/digest-builder.service';
import { DigestQueryService } from './services/digest-query.service';
import { EmailTemplateService } from './services/email-template.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Digest,
      DigestItem,
      ArticleAnalysis,
      ArticleRelevance,
      Article,
      Source,
      SourceCandidate,
    ]),
    MailModule,
    QueueModule,
    AiAnalysisModule,
    ArticlesModule,
    FeedFetcherModule,
    SourcesModule,
  ],
  controllers: [DigestController],
  providers: [
    AiDigestService,
    EmailTemplateService,
    DigestBuilderService,
    DigestQueryService,
    DigestProcessor,
    DigestBootstrapService,
  ],
  exports: [DigestBuilderService, DigestQueryService],
})
export class DigestModule {}
