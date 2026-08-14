import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../common/redis/redis.service';
import { PreviewFeedResponseDto } from '../dto/preview-feed-response.dto';
import { PublicFeedResponseDto } from '../dto/public-feed-response.dto';
import { QueryPublicFeedDto } from '../dto/query-public-feed.dto';
import { FeedCacheVersionService } from '../../feed/services/feed-cache-version.service';
import { MetricsService } from '../../common/metrics/metrics.service';

const DEFAULT_TTL_SECONDS = 600;

// Distinct key prefixes from FeedCacheService's `feed:*` (see feed-cache-invalidation.service.ts)
// so FeedCacheInvalidationService's per-user `delByPattern('feed:' + userId + ':*')` can never
// collide with these public, identity-less cache entries. TTL-only — no invalidation logic, since
// there is no per-caller identity to target invalidation at.
export const PUBLIC_FEED_LIST_CACHE_KEY_PREFIX = 'public-feed:list';
export const PUBLIC_FEED_PREVIEW_CACHE_KEY_PREFIX = 'public-feed:preview';

@Injectable()
export class PublicFeedCacheService {
  constructor(
    private readonly redisService: RedisService,
    private readonly versionService: FeedCacheVersionService,
    private readonly metricsService: MetricsService,
  ) {}

  async buildVersionedListKey(query: QueryPublicFeedDto, streamIds: string[]): Promise<string> {
    const versions = await this.versionService.getStreamVersions(streamIds);
    const versionHash = createHash('sha1').update(JSON.stringify(versions)).digest('hex');
    return `${this.buildListKey(query)}:${versionHash}`;
  }

  async buildVersionedPreviewKey(
    technologyInterestIds: string[],
    contentStreamIds: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Promise<string> {
    const versions = await this.versionService.getStreamVersions(contentStreamIds);
    const versionHash = createHash('sha1').update(JSON.stringify(versions)).digest('hex');
    return `${this.buildPreviewKey(technologyInterestIds, contentStreamIds, dateFrom, dateTo)}:${versionHash}`;
  }

  // Stable across param order — filters are sorted before hashing.
  buildListKey(query: QueryPublicFeedDto): string {
    const normalized = {
      stream: [...(query.stream ?? [])].sort(),
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
    const hash = createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
    return `${PUBLIC_FEED_LIST_CACHE_KEY_PREFIX}:${hash}`;
  }

  buildPreviewKey(
    technologyInterestIds: string[],
    contentStreamIds: string[],
    dateFrom?: string,
    dateTo?: string,
  ): string {
    const normalized = {
      technologyInterestIds: [...technologyInterestIds].sort(),
      contentStreamIds: [...contentStreamIds].sort(),
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
    };
    const hash = createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
    return `${PUBLIC_FEED_PREVIEW_CACHE_KEY_PREFIX}:${hash}`;
  }

  async getList(key: string): Promise<PublicFeedResponseDto | null> {
    return this.get<PublicFeedResponseDto>(key);
  }

  async setList(key: string, value: PublicFeedResponseDto): Promise<void> {
    await this.set(key, value);
  }

  async getPreview(key: string): Promise<PreviewFeedResponseDto | null> {
    return this.get<PreviewFeedResponseDto>(key);
  }

  async setPreview(key: string, value: PreviewFeedResponseDto): Promise<void> {
    await this.set(key, value);
  }

  private async get<T>(key: string): Promise<T | null> {
    const raw = await this.redisService.get(key);
    if (!raw) {
      await this.metricsService.increment('feed_cache_total', { outcome: 'miss', scope: 'public' });
      return null;
    }
    await this.metricsService.increment('feed_cache_total', { outcome: 'hit', scope: 'public' });
    return JSON.parse(raw) as T;
  }

  private async set(key: string, value: unknown): Promise<void> {
    const ttlSeconds = Number(process.env.PUBLIC_FEED_CACHE_TTL_SECONDS) || DEFAULT_TTL_SECONDS;
    await this.redisService.set(key, JSON.stringify(value), ttlSeconds);
  }
}
