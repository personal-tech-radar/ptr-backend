import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, TransformFnParams } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

// Normalizes a repeated query key (?stream=a&stream=b -> ['a','b']) and a single occurrence
// (?stream=a -> 'a', which class-transformer/qs would otherwise leave as a bare string) into a
// consistent array shape. No existing multi-value query param precedent elsewhere in this
// codebase — this is the standard NestJS approach for repeated query keys.
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? (value as string[]) : [value as string];
};

// Reads the raw value from `obj[key]` rather than the pipeline-provided `value`. The global
// ValidationPipe's `enableImplicitConversion` runs class-transformer's own Boolean(value) coercion
// on the property BEFORE this @Transform executes (design:type Boolean is reflected for the field),
// and Boolean('false') is `true` — any non-empty string is truthy. Reading obj[key] bypasses that
// already-corrupted `value` and parses the original query string directly.
const toBoolean = ({ obj, key }: TransformFnParams): boolean | undefined => {
  const raw = obj[key];
  if (raw === undefined) return undefined;
  if (typeof raw === 'boolean') return raw;
  return raw === 'true';
};

export class QueryFeedDto {
  @ApiPropertyOptional({
    description:
      "Most recent day (inclusive) to include, YYYY-MM-DD, interpreted in the user's own " +
      "timezone. Defaults to today in the user's timezone.",
    example: '2026-07-25',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'beforeDate must be in YYYY-MM-DD format' })
  beforeDate?: string;

  // DTO-level bound is hardcoded to 30 (matching FEED_MAX_DAYS's default) rather than reading
  // the env var at decoration time — the service additionally clamps against the live
  // FEED_MAX_DAYS value, so lowering that env var below 30 still takes effect even though this
  // decorator's ceiling doesn't move.
  @ApiPropertyOptional({
    description:
      'Number of days to include, counting back inclusive from beforeDate. Clamped server-side ' +
      'to the FEED_MAX_DAYS env var (default 30).',
    example: 7,
    minimum: 1,
    maximum: 30,
    default: 7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number = 7;

  @ApiPropertyOptional({
    description:
      'Filter to one or more content stream keys (e.g. "security"). When given, the feed skips ' +
      'per-stream distribution and returns the top 50 matching articles per day, ranked by score.',
    type: [String],
    example: ['security'],
  })
  @IsOptional()
  @IsArray()
  @Transform(toArray)
  stream?: string[];

  @ApiPropertyOptional({
    description: 'Filter to one or more technology/interest ids (kind: technology).',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsOptional()
  @IsArray()
  @Transform(toArray)
  @IsUUID('4', { each: true })
  technology?: string[];

  @ApiPropertyOptional({
    description: 'Filter to one or more technology/interest ids (kind: interest).',
    type: [String],
    example: ['223e4567-e89b-12d3-a456-426614174000'],
  })
  @IsOptional()
  @IsArray()
  @Transform(toArray)
  @IsUUID('4', { each: true })
  interest?: string[];

  @ApiPropertyOptional({
    description: 'Filter to one or more source ids.',
    type: [String],
    example: ['323e4567-e89b-12d3-a456-426614174000'],
  })
  @IsOptional()
  @IsArray()
  @Transform(toArray)
  @IsUUID('4', { each: true })
  source?: string[];

  @ApiPropertyOptional({
    description:
      "When true, returns only the user's saved articles instead of the topical feed. Exempt " +
      'from the 30-day floor and cannot be combined with stream/technology/interest/source filters.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  saved?: boolean = false;
}
