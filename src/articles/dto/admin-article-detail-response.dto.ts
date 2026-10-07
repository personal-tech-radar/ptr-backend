import { ApiProperty } from '@nestjs/swagger';
import { ArticleResponseDto } from './article-response.dto';
import { SourceType } from '../../sources/entities/source.entity';
import {
  ArticleAnalysis,
  ArticleComplexityLevel,
  ArticleMaterialType,
} from '../../ai-analysis/entities/article-analysis.entity';
import { ContentExtractionMethod } from '../entities/article.entity';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export class ArticleSourceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() url: string;
  @ApiProperty({ enum: SourceType }) type: SourceType;
}
export class ArticleTaxonomyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['technology', 'interest'] }) kind: string;
}
export class ArticleStreamResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() key: string;
  @ApiProperty() name: string;
  @ApiProperty() isPrimary: boolean;
}
export class AdminArticleAnalysisResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: Boolean, nullable: true }) preScreenIsRelevant: boolean | null;
  @ApiProperty({ type: String, nullable: true }) preScreenReason: string | null;
  @ApiProperty({ type: String, nullable: true }) shortSummary: string | null;
  @ApiProperty({ type: String, nullable: true }) longSummary: string | null;
  @ApiProperty({ type: String, nullable: true }) whyItMatters: string | null;
  @ApiProperty({ type: String, nullable: true }) practicalValue: string | null;
  @ApiProperty({ type: String, nullable: true }) mainStreamId: string | null;
  @ApiProperty({ type: Date, nullable: true }) preScreenAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) fullAnalysisAt: Date | null;
  @ApiProperty({ type: Number, nullable: true }) relevanceScore: number | null;
  @ApiProperty({ type: Number, nullable: true }) qualityScore: number | null;
  @ApiProperty({ type: Number, nullable: true }) finalScore: number | null;
  @ApiProperty({ type: Number, nullable: true }) urgencyScore: number | null;
  @ApiProperty() shouldIncludeInDailyDigest: boolean;
  @ApiProperty() shouldIncludeInWeeklyDigest: boolean;
  @ApiProperty() evergreen: boolean;
  @ApiProperty() breakingChanges: boolean;
  @ApiProperty({ type: [String], nullable: true }) tags: string[] | null;
  @ApiProperty({ enum: ArticleComplexityLevel, nullable: true })
  complexityLevel: ArticleComplexityLevel | null;
  @ApiProperty({ enum: ArticleMaterialType, nullable: true })
  materialType: ArticleMaterialType | null;
  @ApiProperty({ type: Object, nullable: true, additionalProperties: true }) releaseData: Record<
    string,
    unknown
  > | null;
  @ApiProperty({ type: Object, nullable: true, additionalProperties: true }) securityData: Record<
    string,
    unknown
  > | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
export function toAdminAnalysisDto(
  analysis: ArticleAnalysis | null,
): AdminArticleAnalysisResponseDto | null {
  if (!analysis) return null;
  const {
    id,
    preScreenIsRelevant,
    preScreenReason,
    preScreenAt,
    fullAnalysisAt,
    shortSummary,
    longSummary,
    whyItMatters,
    practicalValue,
    tags,
    shouldIncludeInDailyDigest,
    shouldIncludeInWeeklyDigest,
    complexityLevel,
    materialType,
    evergreen,
    breakingChanges,
    releaseData,
    securityData,
    mainStreamId,
    createdAt,
    updatedAt,
  } = analysis;
  const numeric = (value: number | null) => (value === null ? null : Number(value));
  return {
    id,
    preScreenIsRelevant,
    preScreenReason,
    preScreenAt,
    fullAnalysisAt,
    shortSummary,
    longSummary,
    whyItMatters,
    practicalValue,
    tags,
    shouldIncludeInDailyDigest,
    shouldIncludeInWeeklyDigest,
    complexityLevel,
    materialType,
    evergreen,
    breakingChanges,
    releaseData,
    securityData,
    mainStreamId,
    createdAt,
    updatedAt,
    relevanceScore: numeric(analysis.relevanceScore),
    qualityScore: numeric(analysis.qualityScore),
    finalScore: numeric(analysis.finalScore),
    urgencyScore: numeric(analysis.urgencyScore),
  };
}
export class AdminArticleListItemDto extends ArticleResponseDto {
  @ApiProperty({ type: ArticleSourceResponseDto, nullable: true })
  source: ArticleSourceResponseDto | null;
  @ApiProperty({ enum: ContentExtractionMethod }) contentExtractionMethod: ContentExtractionMethod;
  @ApiProperty({ type: Date, nullable: true }) contentFetchedAt: Date | null;
  @ApiProperty({ type: ArticleStreamResponseDto, nullable: true })
  primaryStream: ArticleStreamResponseDto | null;
  @ApiProperty({ type: Number, nullable: true }) qualityScore: number | null;
  @ApiProperty({ type: Number, nullable: true }) finalScore: number | null;
}
export class PaginatedAdminArticleResponseDto extends PaginatedResponseDto<AdminArticleListItemDto> {
  @ApiProperty({ type: [AdminArticleListItemDto] }) declare data: AdminArticleListItemDto[];
}
export class AdminArticleDetailResponseDto extends AdminArticleListItemDto {
  @ApiProperty({ type: String, nullable: true }) rawContent: string | null;
  @ApiProperty({ type: Object, nullable: true, additionalProperties: true })
  contentExtractionConfig: Record<string, unknown> | null;
  @ApiProperty({ type: AdminArticleAnalysisResponseDto, nullable: true })
  analysis: AdminArticleAnalysisResponseDto | null;
  @ApiProperty({ type: [ArticleTaxonomyResponseDto] }) technologies: ArticleTaxonomyResponseDto[];
  @ApiProperty({ type: [ArticleTaxonomyResponseDto] }) interests: ArticleTaxonomyResponseDto[];
  @ApiProperty({ type: [ArticleStreamResponseDto] }) streams: ArticleStreamResponseDto[];
}
