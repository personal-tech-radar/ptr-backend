import { ApiProperty } from '@nestjs/swagger';
import { ArticleResponseDto } from '../../articles/dto/article-response.dto';
import { SavedArticle } from '../entities/saved-article.entity';

export class SavedArticleResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  articleId: string;

  @ApiProperty({ type: ArticleResponseDto })
  article: ArticleResponseDto;

  @ApiProperty({ description: 'When the article was saved' })
  savedAt: Date;
}

// entity.article must be loaded (relations: ['article']) before calling this — see
// SavedArticleService, which always fetches the joined row after a write.
export function toSavedArticleResponseDto(entity: SavedArticle): SavedArticleResponseDto {
  return {
    id: entity.id,
    articleId: entity.articleId,
    article: {
      id: entity.article.id,
      sourceId: entity.article.sourceId,
      title: entity.article.title,
      url: entity.article.url,
      urlHash: entity.article.urlHash,
      author: entity.article.author,
      publishedAt: entity.article.publishedAt,
      summaryFromFeed: entity.article.summaryFromFeed,
      status: entity.article.status,
      createdAt: entity.article.createdAt,
      updatedAt: entity.article.updatedAt,
    },
    savedAt: entity.createdAt,
  };
}
