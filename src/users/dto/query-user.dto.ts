import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsIn, Min } from 'class-validator';

// Reads the raw value from `obj[key]` rather than the pipeline-provided `value`. The global
// ValidationPipe's `enableImplicitConversion` runs class-transformer's own Boolean(value) coercion
// on the property BEFORE this @Transform executes (design:type Boolean is reflected for the field),
// and Boolean('false') is `true` — any non-empty string is truthy. Reading obj[key] bypasses that
// already-corrupted `value` and parses the original query string directly.
const toBoolean = ({ obj, key }: TransformFnParams): boolean | undefined => {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === undefined) return undefined;
  if (typeof raw === 'boolean') return raw;
  return raw === 'true';
};

// Used by UserQueryService.findAll, backing the admin users listing endpoint
// (AdminUsersController, GET /admin/users).
export class QueryUserDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() verifiedFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() verifiedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() onboardingFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() onboardingTo?: string;
  @ApiPropertyOptional({
    description: 'Exact activity window, inclusive lower bound; overrides activityPeriod start.',
  })
  @IsOptional()
  @IsDateString()
  activityFrom?: string;
  @ApiPropertyOptional({ description: 'Exact activity window, exclusive upper bound.' })
  @IsOptional()
  @IsDateString()
  activityTo?: string;
  @ApiPropertyOptional({ enum: ['open', 'save', 'useful', 'not_useful'] })
  @IsOptional()
  @IsIn(['open', 'save', 'useful', 'not_useful'])
  eventType?: string;
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
    description: 'Case-insensitive partial match filter on email',
    example: 'jane',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  email?: string;

  @ApiPropertyOptional({
    description: 'Include soft-deleted users in the results',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDeleted?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registeredFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registeredTo?: string;

  @ApiPropertyOptional({ description: 'Filter email verification state' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional({ description: 'Filter whether onboarding has completed' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onboardingCompleted?: boolean;

  @ApiPropertyOptional({ enum: ['24h', '7d', '30d'] })
  @IsOptional()
  @IsIn(['24h', '7d', '30d'])
  activityPeriod?: '24h' | '7d' | '30d';
}
