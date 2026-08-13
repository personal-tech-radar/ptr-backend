import { ApiProperty } from '@nestjs/swagger';
import {
  ArticleComplexityLevel,
  ArticleMaterialType,
} from '../../ai-analysis/entities/article-analysis.entity';

export class FeedArticleItemDto {
  @ApiProperty({ description: 'Article id', example: '123e4567-e89b-12d3-a456-426614174000' })
  articleId: string;

  @ApiProperty({ description: 'Article title', example: 'Understanding NestJS Modules' })
  title: string;

  @ApiProperty({
    description:
      'Personal redirect link (${APP_URL}/r/{linkId}) — resolves to the real article URL and ' +
      'records the first open. Never the raw article URL.',
    example: 'https://app.example.com/r/9b2f6b2e-4c7b-4e4a-9c2e-6f2b3a1d9e10',
  })
  url: string;

  @ApiProperty({ description: 'Source name', example: 'NestJS Blog' })
  sourceName: string;

  @ApiProperty({ description: 'Publish date/time', example: '2026-07-24T10:00:00.000Z' })
  publishedAt: Date;

  @ApiProperty({ description: 'Short summary', example: 'A quick tour of module boundaries.' })
  shortSummary: string;

  @ApiProperty({
    description: 'Complexity level',
    enum: ArticleComplexityLevel,
    nullable: true,
    example: ArticleComplexityLevel.INTERMEDIATE,
  })
  complexityLevel: ArticleComplexityLevel | null;

  @ApiProperty({
    description: 'Material type',
    enum: ArticleMaterialType,
    nullable: true,
    example: ArticleMaterialType.ARTICLE,
  })
  materialType: ArticleMaterialType | null;

  @ApiProperty({ description: 'Computed relevance score used for ranking', example: 78.5 })
  score: number;
}
