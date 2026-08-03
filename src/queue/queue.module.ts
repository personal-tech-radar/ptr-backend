import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  QUEUE_ARTICLE_ANALYSIS,
  QUEUE_DIGEST,
  QUEUE_FEED_FETCH,
  QUEUE_TAXONOMY_SOURCE_DISCOVERY,
  QUEUE_WEB_SOURCE_BROWSER_FETCH,
  QueueService,
} from './services/queue.service';
import { AdminJobsController } from './controllers/admin-jobs.controller';

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
      {
        name: QUEUE_FEED_FETCH,
        defaultJobOptions: {
          attempts: 3,
          removeOnComplete: { age: 2592000 },
          removeOnFail: { age: 2592000 },
        },
      },
      {
        name: QUEUE_ARTICLE_ANALYSIS,
        defaultJobOptions: {
          attempts: 3,
          removeOnComplete: { age: 2592000 },
          removeOnFail: { age: 2592000 },
        },
      },
      {
        name: QUEUE_DIGEST,
        defaultJobOptions: {
          attempts: 3,
          removeOnComplete: { age: 2592000 },
          removeOnFail: { age: 2592000 },
        },
      },
      { name: QUEUE_WEB_SOURCE_BROWSER_FETCH },
      {
        name: QUEUE_TAXONOMY_SOURCE_DISCOVERY,
        defaultJobOptions: {
          attempts: 3,
          removeOnComplete: { age: 2592000 },
          removeOnFail: { age: 2592000 },
        },
      },
    ),
  ],
  providers: [QueueService],
  controllers: [AdminJobsController],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
