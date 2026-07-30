import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ArticleFeedbackType } from '../entities/article-feedback.entity';

// Backs AdminArticleFeedbackController's GET /admin/article-feedback listing.
export class AdminQueryArticleFeedbackDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, minimum: 1, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Case-insensitive partial match filter on the linked user email',
    example: 'jane',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  email?: string;

  @ApiPropertyOptional({
    description: 'Filter by article id',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @ApiPropertyOptional({
    enum: ArticleFeedbackType,
    description: 'Filter by feedback type',
    example: ArticleFeedbackType.USEFUL,
  })
  @IsOptional()
  @IsEnum(ArticleFeedbackType)
  type?: ArticleFeedbackType;
}
