import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PublicFeedArticleItemDto } from './public-feed-article-item.dto';

export class PublicFeedResponseDto extends PaginatedResponseDto<PublicFeedArticleItemDto> {
  @ApiProperty({ type: [PublicFeedArticleItemDto] })
  declare data: PublicFeedArticleItemDto[];
}
