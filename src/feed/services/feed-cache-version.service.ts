import { Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class FeedCacheVersionService {
  constructor(private readonly redisService: RedisService) {}

  async getStreamVersions(streamKeys: string[]): Promise<Record<string, number>> {
    const entries = await Promise.all(
      [...new Set(streamKeys)]
        .sort()
        .map(
          async (streamKey) =>
            [
              streamKey,
              Number((await this.redisService.get(this.streamKey(streamKey))) ?? 0),
            ] as const,
        ),
    );
    return Object.fromEntries(entries);
  }

  async incrementStreams(streamKeys: string[]): Promise<void> {
    await Promise.all(
      [...new Set(streamKeys)].map((streamKey) =>
        this.redisService.incr(this.streamKey(streamKey)),
      ),
    );
  }

  async getUserVersion(userId: string): Promise<number> {
    return Number((await this.redisService.get(this.userKey(userId))) ?? 0);
  }

  async incrementUser(userId: string): Promise<void> {
    await this.redisService.incr(this.userKey(userId));
  }

  private streamKey(streamKey: string): string {
    return `feed-cache-version:stream:${streamKey}`;
  }

  private userKey(userId: string): string {
    return `feed-cache-version:user:${userId}`;
  }
}
