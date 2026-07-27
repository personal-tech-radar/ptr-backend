import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { FeedResponseDto } from '../dto/feed-response.dto';
import { QueryFeedDto } from '../dto/query-feed.dto';
import { OnboardingCompletedGuard } from '../guards/onboarding-completed.guard';
import { FeedCacheService } from '../services/feed-cache.service';
import { FeedQueryService } from '../services/feed-query.service';

@ApiTags('Feed')
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ErrorResponseDto })
// JwtAuthGuard must run first — it populates request.user, which OnboardingCompletedGuard reads.
@UseGuards(JwtAuthGuard, OnboardingCompletedGuard)
@Controller('feed')
export class FeedController {
  constructor(
    private readonly feedQueryService: FeedQueryService,
    private readonly feedCacheService: FeedCacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "Get the current user's personal feed — day-grouped, scored, and capped/distributed " +
      'across their selected content streams. See README for the full algorithm.',
  })
  @ApiResponse({ status: 200, type: FeedResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: 'Onboarding not completed (errorCode: ONBOARDING_NOT_COMPLETED)',
  })
  async getFeed(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: QueryFeedDto,
  ): Promise<FeedResponseDto> {
    // Uses the raw request `beforeDate` (or the 'today' sentinel when omitted) rather than a
    // fully resolved calendar date — resolving "today in the user's own timezone" requires a
    // user/timezone lookup, which would duplicate work FeedQueryService already does on a cache
    // miss and defeat the point of checking the cache first. Trade-off: a request made without
    // an explicit beforeDate can, in the rare case where a cache entry was written just before
    // local midnight in the user's timezone, be served up to FEED_CACHE_TTL_SECONDS stale across
    // that day boundary — bounded and self-healing via the existing TTL.
    const days = query.days ?? 7;
    const cacheKey = this.feedCacheService.buildKey(
      user.id,
      query,
      query.beforeDate ?? 'today',
      days,
    );

    const cached = await this.feedCacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.feedQueryService.getFeed(user.id, query);
    await this.feedCacheService.set(cacheKey, result);
    return result;
  }
}
