import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../common/redis/redis.service';
import { QueryFeedDto } from '../dto/query-feed.dto';
import { FeedResponseDto } from '../dto/feed-response.dto';
import { FEED_CACHE_KEY_PREFIX } from './feed-cache-invalidation.service';

const DEFAULT_TTL_SECONDS = 600;

@Injectable()
export class FeedCacheService {
  constructor(private readonly redisService: RedisService) {}

  // Stable across param order — filters are sorted before hashing, so `?stream=a&stream=b` and
  // `?stream=b&stream=a` hash identically. Uses Node's built-in crypto (no new dependency).
  buildKey(userId: string, query: QueryFeedDto, resolvedBeforeDate: string, days: number): string {
    const filterHash = this.hashFilters(query);
    return `${FEED_CACHE_KEY_PREFIX}:${userId}:${filterHash}:${resolvedBeforeDate}:${days}`;
  }

  async get(key: string): Promise<FeedResponseDto | null> {
    const raw = await this.redisService.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as FeedResponseDto;
  }

  async set(key: string, value: FeedResponseDto): Promise<void> {
    const ttlSeconds = Number(process.env.FEED_CACHE_TTL_SECONDS) || DEFAULT_TTL_SECONDS;
    await this.redisService.set(key, JSON.stringify(value), ttlSeconds);
  }

  private hashFilters(query: QueryFeedDto): string {
    const normalized = {
      stream: [...(query.stream ?? [])].sort(),
      technology: [...(query.technology ?? [])].sort(),
      interest: [...(query.interest ?? [])].sort(),
      source: [...(query.source ?? [])].sort(),
      saved: query.saved ?? false,
    };
    return createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
  }
}
