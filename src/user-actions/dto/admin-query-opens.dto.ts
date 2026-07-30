import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PersonalArticleLinkContext } from '../entities/personal-article-link.entity';

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

// Backs AdminOpensController's GET /admin/opens listing.
export class AdminQueryOpensDto {
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

  @ApiPropertyOptional({ enum: PersonalArticleLinkContext, description: 'Filter by link context' })
  @IsOptional()
  @IsEnum(PersonalArticleLinkContext)
  context?: PersonalArticleLinkContext;

  @ApiPropertyOptional({
    description: 'Filter by whether the link has been opened at least once',
    example: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  opened?: boolean;
}
