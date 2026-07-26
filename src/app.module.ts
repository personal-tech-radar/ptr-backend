import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiAnalysisModule } from './ai-analysis/ai-analysis.module';
import { ArticlesModule } from './articles/articles.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './common/database/database.module';
import { ErrorModule } from './common/error/error.module';
import { RedisModule } from './common/redis/redis.module';
import { S3Module } from './common/s3/s3.module';
import { DigestModule } from './digest/digest.module';
import { FeedFetcherModule } from './feed-fetcher/feed-fetcher.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { QueueModule } from './queue/queue.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ScoringModule } from './scoring/scoring.module';
import { SourcesModule } from './sources/sources.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    DatabaseModule,
    RedisModule,
    S3Module,
    ErrorModule,
    HealthModule,
    QueueModule,
    SourcesModule,
    ArticlesModule,
    FeedFetcherModule,
    AiAnalysisModule,
    DigestModule,
    MailModule,
    SchedulerModule,
    UsersModule,
    AuthModule,
    TaxonomyModule,
    ScoringModule,
  ],
})
export class AppModule {}
