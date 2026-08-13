import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { LoggingService } from '../../common/logging/logging.service';
import { QueueService } from '../../queue/services/queue.service';
import { IngestionScheduleService } from './ingestion-schedule.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new LoggingService(SchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly queueService: QueueService,
    private readonly ingestionScheduleService: IngestionScheduleService,
  ) {}

  onModuleInit(): void {
    this.registerCronJob('mvp3-orchestrator', '*/5 * * * *', async () => {
      const bucket = Math.floor(Date.now() / 300_000);
      const dueSources = await this.ingestionScheduleService.findDue();
      await Promise.all(
        dueSources.map((source) =>
          this.queueService.addFetchSourceJob(
            source.sourceId,
            source.streamIds,
            source.priority,
            bucket,
          ),
        ),
      );
      await this.queueService.addDigestSweepJob(bucket);
      await this.queueService.addTechnicalHistoryCleanupJob(bucket);
      this.logger.info('Scheduler orchestrator dispatched due work', {
        bucket,
        dueSourceCount: dueSources.length,
      });
    });
  }

  private registerCronJob(name: string, expression: string, callback: () => Promise<void>): void {
    const job = new CronJob(expression, () => {
      callback().catch((err) => this.logger.error(`Cron job "${name}" failed`, err));
    });
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.info(`Cron job registered: "${name}" [${expression}]`);
  }
}
