import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  SourceCandidateDetectedType,
  SourceCandidateStatus,
  SourceDiscoveryOrigin,
} from '../entities/source-candidate.entity';
import { SourceType } from '../entities/source.entity';

export class SourceCandidateListQueryDto {
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

  @ApiPropertyOptional({ enum: SourceCandidateStatus })
  @IsEnum(SourceCandidateStatus)
  @IsOptional()
  status?: SourceCandidateStatus;

  @ApiPropertyOptional({ enum: SourceDiscoveryOrigin })
  @IsEnum(SourceDiscoveryOrigin)
  @IsOptional()
  origin?: SourceDiscoveryOrigin;

  @ApiPropertyOptional({ enum: SourceType })
  @IsEnum(SourceType)
  @IsOptional()
  expectedSourceType?: SourceType;

  @ApiPropertyOptional({ enum: SourceCandidateDetectedType })
  @IsEnum(SourceCandidateDetectedType)
  @IsOptional()
  detectedType?: SourceCandidateDetectedType;

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
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  createdTo?: string;
}
