import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicTaxonomyItemDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
}

export class PublicStreamItemDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  key: string;
  @ApiProperty()
  name: string;
}

export class PublicArticleResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  originalUrl: string;
  @ApiProperty()
  publicRedirectUrl: string;
  @ApiProperty()
  source: { id: string; name: string; type: string };
  @ApiPropertyOptional()
  author: string | null;
  @ApiPropertyOptional()
  publishedAt: Date | null;
  @ApiPropertyOptional()
  summary: string | null;
  @ApiPropertyOptional({ description: 'Detailed three-paragraph article-page summary.' })
  longSummary: string | null;
  @ApiProperty({ type: [PublicTaxonomyItemDto] })
  technologies: PublicTaxonomyItemDto[];
  @ApiProperty({ type: [PublicTaxonomyItemDto] })
  interests: PublicTaxonomyItemDto[];
  @ApiProperty({ type: [PublicStreamItemDto] })
  streams: PublicStreamItemDto[];
  @ApiPropertyOptional({ type: PublicStreamItemDto })
  primaryStream: PublicStreamItemDto | null;
  @ApiPropertyOptional()
  complexity: string | null;
  @ApiPropertyOptional()
  qualityScore: number | null;
  @ApiProperty()
  publicClickCount: number;
  @ApiProperty()
  personalTrackedOpenCount: number;
  @ApiProperty()
  totalClickCount: number;
  @ApiProperty()
  createdAt: Date;
  @ApiProperty()
  updatedAt: Date;
}
