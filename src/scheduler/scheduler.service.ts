import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { LoggingService } from '../common/logging/logging.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new LoggingService(SchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly queueService: QueueService,
  ) {}

  onModuleInit(): void {
    const fetchCron = process.env.FETCH_CRON || '0 * * * *';
    const digestCron = process.env.DIGEST_CRON || '0 7 * * 1-5';
    const weeklyDigestCron = process.env.WEEKLY_DIGEST_CRON || '0 8 * * 5';
    const deepDiveCron = process.env.DEEP_DIVE_CRON || '0 8 * * 1';

    this.registerCronJob('fetch-all-sources', fetchCron, async () => {
      this.logger.info('Cron: dispatching fetch-all-sources job');
      await this.queueService.addFetchAllSourcesJob();
    });

    this.registerCronJob('build-daily-digest', digestCron, async () => {
      this.logger.info('Cron: dispatching build-daily-digest job');
      await this.queueService.addBuildDailyDigestJob();
    });

    this.registerCronJob('build-weekly-digest', weeklyDigestCron, async () => {
      this.logger.info('Cron: dispatching build-weekly-digest job');
      await this.queueService.addBuildWeeklyDigestJob();
    });

    this.registerCronJob('build-deep-dive-weekly-digest', deepDiveCron, async () => {
      this.logger.info('Cron: dispatching build-deep-dive-weekly-digest job');
      await this.queueService.addBuildDeepDiveWeeklyDigestJob();
    });

  }

  private registerCronJob(
    name: string,
    expression: string,
    callback: () => Promise<void>,
  ): void {
    const job = new CronJob(expression, () => {
      callback().catch((err) =>
        this.logger.error(`Cron job "${name}" failed`, err),
      );
    });
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.info(`Cron job registered: "${name}" [${expression}]`);
  }
}
