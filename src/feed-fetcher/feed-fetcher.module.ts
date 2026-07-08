import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { HttpModule } from '../common/http/http.module';
import { QueueModule } from '../queue/queue.module';
import { SourcesModule } from '../sources/sources.module';
import { FeedFetchProcessor } from './processors/feed-fetch.processor';
import { PlaywrightFetchProcessor } from './processors/playwright-fetch.processor';
import { FeedFetcherService } from './services/feed-fetcher.service';
import { WebSourceFetcherService } from './services/web-source-fetcher.service';

@Module({
  imports: [SourcesModule, ArticlesModule, QueueModule, HttpModule],
  providers: [
    FeedFetcherService,
    WebSourceFetcherService,
    FeedFetchProcessor,
    PlaywrightFetchProcessor,
  ],
  exports: [FeedFetcherService],
})
export class FeedFetcherModule {}
