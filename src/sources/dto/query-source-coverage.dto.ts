import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { SourceStatus } from '../entities/source.entity';

export class QuerySourceCoverageDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
  @ApiPropertyOptional({ description: 'Rows per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'Filter by one technology or interest ID' })
  @IsOptional()
  @IsUUID()
  technologyInterestId?: string;
  @ApiPropertyOptional({ description: 'Filter by one content stream ID' })
  @IsOptional()
  @IsUUID()
  streamId?: string;
  @ApiPropertyOptional({ enum: TechnologyInterestKind, description: 'Filter by taxonomy kind' })
  @IsOptional()
  @IsEnum(TechnologyInterestKind)
  kind?: TechnologyInterestKind;
  @ApiPropertyOptional({
    enum: SourceStatus,
    description: 'Count only relationships with this source state',
  })
  @IsOptional()
  @IsEnum(SourceStatus)
  sourceStatus?: SourceStatus;
  @ApiPropertyOptional({ description: 'Return rows with at least this many active sources' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minActiveSources?: number;
  @ApiPropertyOptional({ description: 'Return only taxonomy/stream rows with no active sources' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  zeroActiveCoverage?: boolean;
}
