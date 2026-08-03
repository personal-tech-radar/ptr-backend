import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PersonalArticleLinkContext } from '../entities/personal-article-link.entity';

// Read the raw query string so "false" is not coerced to true before validation.
const toBoolean = ({ obj, key }: TransformFnParams): boolean | undefined => {
  const raw = (obj as Record<string, unknown>)[key];
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
