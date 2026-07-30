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
    // Ticks every 15 minutes and evaluates every eligible user's own local send-time window
    // (DigestSweepService) — replaces the old fixed-UTC per-cadence crons entirely (MVP3 Phase
    // 10). See DigestSweepService for the actual daily(Mon-Fri)/weekly(Fri 14:00) local-time
    // logic; this cron only controls how often the sweep itself runs.
    const digestSweepCron = process.env.DIGEST_SWEEP_CRON || '*/15 * * * *';

    this.registerCronJob('fetch-all-sources', fetchCron, async () => {
      this.logger.info('Cron: dispatching fetch-all-sources job');
      await this.queueService.addFetchAllSourcesJob();
    });

    this.registerCronJob('digest-sweep', digestSweepCron, async () => {
      this.logger.info('Cron: dispatching digest-sweep job');
      await this.queueService.addDigestSweepJob();
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
