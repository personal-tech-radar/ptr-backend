import { ApiProperty } from '@nestjs/swagger';
import { ArticleResponseDto } from '../../articles/dto/article-response.dto';

export class AdminSavedArticleResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '223e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ example: 'jane@example.com' })
  userEmail: string;

  @ApiProperty({ example: '323e4567-e89b-12d3-a456-426614174000' })
  articleId: string;

  @ApiProperty({ type: ArticleResponseDto })
  article: ArticleResponseDto;

  @ApiProperty({ description: 'When the article was saved' })
  savedAt: Date;
}
