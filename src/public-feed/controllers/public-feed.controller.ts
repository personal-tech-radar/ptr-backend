import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { PreviewFeedDto } from '../dto/preview-feed.dto';
import { PreviewFeedResponseDto } from '../dto/preview-feed-response.dto';
import { PublicFeedResponseDto } from '../dto/public-feed-response.dto';
import { QueryPublicFeedDto } from '../dto/query-public-feed.dto';
import { PublicFeedCacheService } from '../services/public-feed-cache.service';
import { PublicFeedPreviewService } from '../services/public-feed-preview.service';
import { PublicFeedQueryService } from '../services/public-feed-query.service';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';

// Fully public — no guards anywhere in this controller (no rate limiting either, deliberately
// deferred to a future cross-cutting throttling pass).
@ApiTags('Public Content')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@Controller('public/feed')
export class PublicFeedController {
  constructor(
    private readonly publicFeedQueryService: PublicFeedQueryService,
    private readonly publicFeedPreviewService: PublicFeedPreviewService,
    private readonly publicFeedCacheService: PublicFeedCacheService,
    private readonly contentStreamQueryService: ContentStreamQueryService,
  ) {}

  @Get()
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'List the public article feed',
    description:
      'API-key content endpoint returning a flat, paginated feed of eligible globally analyzed articles, strictly ordered by publishedAt descending. Supports stream and date-range filters and contains no personalization, saved state, feedback, or user identity.',
  })
  @ApiResponse({ status: 200, type: PublicFeedResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async getFeed(@Query() query: QueryPublicFeedDto): Promise<PublicFeedResponseDto> {
    const streams = await this.contentStreamQueryService.findAll();
    const streamIds = query.stream?.length
      ? streams.filter((stream) => query.stream?.includes(stream.key)).map((stream) => stream.id)
      : streams.map((stream) => stream.id);
    const cacheKey = await this.publicFeedCacheService.buildVersionedListKey(query, streamIds);
    const cached = await this.publicFeedCacheService.getList(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.publicFeedQueryService.getFeed(query);
    await this.publicFeedCacheService.setList(cacheKey, result);
    return result;
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Preview a personalized feed before registration',
    description:
      'Anonymous rate-limited preview using selected existing technologies, interests, streams, and experience level without creating a user. Returns a cached flat top-30 result rather than day groups and does not persist personal interaction state.',
  })
  @ApiResponse({ status: 200, type: PreviewFeedResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async preview(@Body() dto: PreviewFeedDto): Promise<PreviewFeedResponseDto> {
    return this.publicFeedPreviewService.preview(dto);
  }
}
