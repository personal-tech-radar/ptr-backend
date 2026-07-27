import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { PreviewFeedDto } from '../dto/preview-feed.dto';
import { PreviewFeedResponseDto } from '../dto/preview-feed-response.dto';
import { PublicFeedResponseDto } from '../dto/public-feed-response.dto';
import { QueryPublicFeedDto } from '../dto/query-public-feed.dto';
import { PublicFeedCacheService } from '../services/public-feed-cache.service';
import { PublicFeedPreviewService } from '../services/public-feed-preview.service';
import { PublicFeedQueryService } from '../services/public-feed-query.service';

// Fully public — no guards anywhere in this controller (no rate limiting either, deliberately
// deferred to a future cross-cutting throttling pass).
@ApiTags('Public Feed')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@Controller('public/feed')
export class PublicFeedController {
  constructor(
    private readonly publicFeedQueryService: PublicFeedQueryService,
    private readonly publicFeedPreviewService: PublicFeedPreviewService,
    private readonly publicFeedCacheService: PublicFeedCacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Public, unauthenticated article feed — flat, paginated, strictly ordered by publishedAt ' +
      'descending. No scoring, no day-grouping. See README for the eligibility criteria.',
  })
  @ApiResponse({ status: 200, type: PublicFeedResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async getFeed(@Query() query: QueryPublicFeedDto): Promise<PublicFeedResponseDto> {
    const cacheKey = this.publicFeedCacheService.buildListKey(query);
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
    summary:
      'Preview what a personal feed would look like for a given set of existing taxonomy ' +
      'selections, without creating an account. Flat, top-30-by-score list — no day-grouping or ' +
      'per-stream distribution. Caching is handled internally by PublicFeedPreviewService.',
  })
  @ApiResponse({ status: 200, type: PreviewFeedResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async preview(@Body() dto: PreviewFeedDto): Promise<PreviewFeedResponseDto> {
    return this.publicFeedPreviewService.preview(dto);
  }
}
