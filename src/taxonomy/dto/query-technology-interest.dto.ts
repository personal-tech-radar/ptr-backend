import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TechnologyInterestKind } from '../entities/technology-interest.entity';

export class QueryTechnologyInterestDto {
  @ApiPropertyOptional({
    enum: TechnologyInterestKind,
    description: 'Filter by kind',
    example: TechnologyInterestKind.TECHNOLOGY,
  })
  @IsOptional()
  @IsEnum(TechnologyInterestKind)
  kind?: TechnologyInterestKind;

  @ApiPropertyOptional({ description: 'Typeahead search on name', example: 'node' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  q?: string;

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
}
