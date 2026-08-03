import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

// Read the raw query string so "false" is not coerced to true before validation.
const toBoolean = ({ obj, key }: TransformFnParams): boolean | undefined => {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === undefined) return undefined;
  if (typeof raw === 'boolean') return raw;
  return raw === 'true';
};

// Backs AdminContentStreamsController's GET /admin/content-streams listing.
export class AdminQueryContentStreamDto {
  @ApiPropertyOptional({
    description: 'Include disabled content streams in the results',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDisabled?: boolean = false;
}
