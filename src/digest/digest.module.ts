import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { ArticlesModule } from '../articles/articles.module';
import { FeedFetcherModule } from '../feed-fetcher/feed-fetcher.module';
import { MailModule } from '../mail/mail.module';
import { QueueModule } from '../queue/queue.module';
import { ScoringModule } from '../scoring/scoring.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { UserActionsModule } from '../user-actions/user-actions.module';
import { UsersModule } from '../users/users.module';
import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../ai-analysis/entities/article-technology-interest.entity';
import { AdminDigestController } from './controllers/admin-digest.controller';
import { DigestController } from './controllers/digest.controller';
import { DigestItem } from './entities/digest-item.entity';
import { Digest } from './entities/digest.entity';
import { DigestProcessor } from './processors/digest.processor';
import { AiDigestService } from './services/ai-digest.service';
import { DigestBootstrapService } from './services/digest-bootstrap.service';
import { DigestQueryService } from './services/digest-query.service';
import { DigestSweepService } from './services/digest-sweep.service';
import { EmailTemplateService } from './services/email-template.service';
import { PersonalDigestBuilderService } from './services/personal-digest-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Digest,
      DigestItem,
      ArticleAnalysis,
      ArticleStream,
      ArticleTechnologyInterest,
    ]),
    MailModule,
    QueueModule,
    AiAnalysisModule,
    ArticlesModule,
    FeedFetcherModule,
    TaxonomyModule,
    ScoringModule,
    UserActionsModule,
    UsersModule,
  ],
  controllers: [DigestController, AdminDigestController],
  providers: [
    AiDigestService,
    EmailTemplateService,
    PersonalDigestBuilderService,
    DigestSweepService,
    DigestQueryService,
    DigestProcessor,
    DigestBootstrapService,
  ],
  exports: [DigestQueryService],
})
export class DigestModule {}
