import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

// Normalizes a repeated query key (?stream=a&stream=b -> ['a','b']) and a single occurrence
// (?stream=a -> 'a') into a consistent array shape — mirrors QueryFeedDto's toArray helper.
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? (value as string[]) : [value as string];
};

export class QueryPublicFeedDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description:
      'Items per page. Capped at 100 (lower than the personal feed) since this endpoint is ' +
      'fully unauthenticated.',
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

  @ApiPropertyOptional({
    description: 'Filter to one or more content stream keys (e.g. "security").',
    type: [String],
    example: ['security'],
  })
  @IsOptional()
  @IsArray()
  @Transform(toArray)
  stream?: string[];

  @ApiPropertyOptional({
    description: 'Earliest publish date (inclusive), YYYY-MM-DD, interpreted in UTC.',
    example: '2026-07-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be in YYYY-MM-DD format' })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Latest publish date (inclusive), YYYY-MM-DD, interpreted in UTC.',
    example: '2026-07-25',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be in YYYY-MM-DD format' })
  dateTo?: string;
}
