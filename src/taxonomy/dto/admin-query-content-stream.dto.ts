import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

// Reads the raw value from `obj[key]` rather than the pipeline-provided `value` — mirrors
// QueryUserDto's `toBoolean` (src/users/dto/query-user.dto.ts). The global ValidationPipe's
// `enableImplicitConversion` runs class-transformer's own Boolean(value) coercion on the property
// BEFORE this @Transform executes, and Boolean('false') is `true` — any non-empty string is
// truthy. Reading obj[key] bypasses that already-corrupted `value` and parses the original query
// string directly.
const toBoolean = ({ obj, key }: TransformFnParams): boolean | undefined => {
  const raw = obj[key];
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
