import { ApiProperty } from '@nestjs/swagger';
import {
  ArticleComplexityLevel,
  ArticleMaterialType,
} from '../../ai-analysis/entities/article-analysis.entity';

export class PreviewFeedArticleItemDto {
  @ApiProperty({ description: 'Article id', example: '123e4567-e89b-12d3-a456-426614174000' })
  articleId: string;

  @ApiProperty({ description: 'Article title', example: 'Understanding NestJS Modules' })
  title: string;

  @ApiProperty({
    description:
      'The raw article URL. Never a personal /go/{linkId} redirect — that mechanism requires a ' +
      'real authenticated user, which this public endpoint does not have.',
    example: 'https://example.com/blog/nestjs-modules',
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

  @ApiProperty({
    description: 'Computed relevance score, per RelevanceScoringService.computeScore',
    example: 78.5,
  })
  score: number;
}
