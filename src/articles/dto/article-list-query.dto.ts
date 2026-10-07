import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { SourceType } from '../../sources/entities/source.entity';
import { Type } from 'class-transformer';
import { ArticleStatus } from '../entities/article.entity';

export class ArticleListQueryDto {
  @ApiPropertyOptional({
    enum: ['feeds', 'web', 'github_release'],
    description: 'Dashboard source group, with RSS and Atom combined.',
  })
  @IsOptional()
  @IsEnum({ feeds: 'feeds', web: 'web', github_release: 'github_release' })
  sourceGroup?: 'feeds' | 'web' | 'github_release';
  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ArticleStatus })
  @IsEnum(ArticleStatus)
  @IsOptional()
  status?: ArticleStatus;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  sourceId?: string;

  @ApiPropertyOptional({ enum: SourceType })
  @IsEnum(SourceType)
  @IsOptional()
  sourceType?: SourceType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  technologyInterestId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  streamId?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  receivedFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  receivedTo?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  publishedFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  publishedTo?: string;

  @ApiPropertyOptional({ description: 'Search title or URL' })
  @IsString()
  @IsOptional()
  q?: string;
}
