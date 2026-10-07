import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { SourceCategory, SourceStatus, SourceType } from '../entities/source.entity';

// Reads the raw value from `obj[key]` rather than the pipeline-provided `value`. The global
// ValidationPipe's `enableImplicitConversion` runs class-transformer's own Boolean(value) coercion
// on the property BEFORE this @Transform executes (design:type Boolean is reflected for the field),
// and Boolean('false') is `true` — any non-empty string is truthy. Reading obj[key] bypasses that
// already-corrupted `value` and parses the original query string directly.
const toBoolean = ({ obj, key }: TransformFnParams): boolean | undefined => {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === undefined) return undefined;
  if (typeof raw === 'boolean') return raw;
  return raw === 'true';
};

export class QuerySourceDto {
  @ApiPropertyOptional({
    enum: ['24h', '7d', '30d'],
    default: '24h',
    description: 'Rolling UTC window for periodArticleCount in list results.',
  })
  @IsOptional()
  @IsIn(['24h', '7d', '30d'])
  period?: '24h' | '7d' | '30d';

  @ApiPropertyOptional({
    enum: ['feeds', 'web', 'github_release'],
    description: 'Dashboard source group; feeds combines RSS and Atom.',
  })
  @IsOptional()
  @IsIn(['feeds', 'web', 'github_release'])
  sourceGroup?: 'feeds' | 'web' | 'github_release';
  @ApiPropertyOptional({ description: 'Search source name, URL, or domain' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by source type', enum: SourceType })
  @IsOptional()
  @IsEnum(SourceType)
  type?: SourceType;

  @ApiPropertyOptional({ description: 'Filter by source category', enum: SourceCategory })
  @IsOptional()
  @IsEnum(SourceCategory)
  category?: SourceCategory;

  @ApiPropertyOptional({ description: 'Filter by lifecycle status', enum: SourceStatus })
  @IsOptional()
  @IsEnum(SourceStatus)
  status?: SourceStatus;

  @ApiPropertyOptional({ description: 'Filter by enabled status', example: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Include soft-deleted sources in the results',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDeleted?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  technologyInterestId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  streamId?: string;
}
