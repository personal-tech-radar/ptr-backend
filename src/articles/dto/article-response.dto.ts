import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArticleStatus } from '../entities/article.entity';

export class ArticleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sourceId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  urlHash: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  author: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  publishedAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  summaryFromFeed: string | null;

  @ApiProperty({ enum: ArticleStatus })
  status: ArticleStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
