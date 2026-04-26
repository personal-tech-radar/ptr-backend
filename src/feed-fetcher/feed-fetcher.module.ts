import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { QueueModule } from '../queue/queue.module';
import { SourcesModule } from '../sources/sources.module';
import { FeedFetchProcessor } from './processors/feed-fetch.processor';
import { FeedFetcherService } from './services/feed-fetcher.service';

@Module({
  imports: [SourcesModule, ArticlesModule, QueueModule],
  providers: [FeedFetcherService, FeedFetchProcessor],
  exports: [FeedFetcherService],
})
export class FeedFetcherModule {}
