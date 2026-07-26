import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsTimeZone, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Display name', example: 'Jane Doe', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) => value?.trim())
  displayName?: string;

  @ApiPropertyOptional({ description: 'IANA timezone string', example: 'Europe/Berlin' })
  @IsOptional()
  @IsTimeZone()
  @Transform(({ value }: { value: string }) => value?.trim())
  timezone?: string;

  @ApiPropertyOptional({
    description: 'GitHub profile URL. Pass null to clear it.',
    example: 'https://github.com/janedoe',
    nullable: true,
  })
  @IsOptional()
  @IsUrl()
  // `value?.trim()` would silently turn an explicit `null` (used to clear the field) into
  // `undefined`, which the service's `!== undefined` guard then treats as "field omitted" and
  // no-ops on. Only trim actual strings so `null` passes through untouched.
  @Transform(({ value }: { value: string | null }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  githubUrl?: string | null;
}
