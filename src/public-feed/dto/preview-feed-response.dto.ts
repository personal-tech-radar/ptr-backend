import { ApiProperty } from '@nestjs/swagger';
import { PreviewFeedArticleItemDto } from './preview-feed-article-item.dto';

// Deliberately not a PaginatedResponseDto shape — the preview endpoint returns a single flat,
// top-30-by-score list rather than a paginated collection.
export class PreviewFeedResponseDto {
  @ApiProperty({ type: [PreviewFeedArticleItemDto] })
  data: PreviewFeedArticleItemDto[];
}
