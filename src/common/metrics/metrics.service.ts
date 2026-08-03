import { Injectable } from '@nestjs/common';
import { LoggingService } from '../logging/logging.service';
import { RedisService } from '../redis/redis.service';

export type MetricLabels = Record<string, string>;

@Injectable()
export class MetricsService {
  private readonly logger = new LoggingService(MetricsService.name);

  constructor(private readonly redisService: RedisService) {}

  async increment(name: string, labels: MetricLabels = {}): Promise<void> {
    const labelKey = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    try {
      await this.redisService.incr(`metrics:counter:${name}${labelKey ? `:${labelKey}` : ''}`);
    } catch (error) {
      this.logger.warn('Metric increment failed', {
        metric: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async observeQueueLag(queue: string, milliseconds: number): Promise<void> {
    const bucket = milliseconds < 1_000 ? 'lt_1s' : milliseconds < 10_000 ? 'lt_10s' : 'gte_10s';
    await this.increment('queue_lag_observations_total', { queue, bucket });
  }
}
