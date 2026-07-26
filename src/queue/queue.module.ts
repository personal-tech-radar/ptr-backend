import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  QUEUE_ARTICLE_ANALYSIS,
  QUEUE_DIGEST,
  QUEUE_FEED_FETCH,
  QUEUE_TAXONOMY_SOURCE_DISCOVERY,
  QUEUE_WEB_SOURCE_BROWSER_FETCH,
  QueueService,
} from './queue.service';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_FEED_FETCH },
      { name: QUEUE_ARTICLE_ANALYSIS },
      { name: QUEUE_DIGEST },
      { name: QUEUE_WEB_SOURCE_BROWSER_FETCH },
      { name: QUEUE_TAXONOMY_SOURCE_DISCOVERY },
    ),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
