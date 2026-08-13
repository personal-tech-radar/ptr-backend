import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { TechnologyInterestKind } from '../entities/technology-interest.entity';

// Read the raw query string so "false" is not coerced to true before validation.
const toBoolean = ({ obj, key }: TransformFnParams): boolean | undefined => {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === undefined) return undefined;
  if (typeof raw === 'boolean') return raw;
  return raw === 'true';
};

// Backs AdminTechnologyInterestsController's GET /admin/technology-interests listing.
export class AdminQueryTechnologyInterestDto {
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
    enum: TechnologyInterestKind,
    description: 'Filter by kind',
    example: TechnologyInterestKind.TECHNOLOGY,
  })
  @IsOptional()
  @IsEnum(TechnologyInterestKind)
  kind?: TechnologyInterestKind;

  @ApiPropertyOptional({
    description: 'Include soft-deleted (merged-away) technologies/interests in the results',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDeleted?: boolean = false;
}
