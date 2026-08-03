import { ApiProperty } from '@nestjs/swagger';
import { PublicArticleResponseDto } from '../../articles/dto/public-article-response.dto';

export class PublicFeedArticleItemDto extends PublicArticleResponseDto {
  @ApiProperty({ description: 'Article id', example: '123e4567-e89b-12d3-a456-426614174000' })
  articleId: string;
}
