import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserLevel } from '../entities/user.entity';

export const GITHUB_PROFILE_URL_PATTERN =
  /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/?$/;

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Display name', example: 'Jane Doe', maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }: { value: string }) => value?.trim())
  displayName?: string;

  @ApiPropertyOptional({ description: 'IANA timezone string', example: 'Europe/Berlin' })
  @IsOptional()
  @IsTimeZone()
  @Transform(({ value }: { value: string }) => value?.trim())
  timezone?: string;

  @ApiPropertyOptional({
    description: 'HTTPS github.com profile URL. Pass null to clear it.',
    example: 'https://github.com/janedoe',
    nullable: true,
  })
  @IsOptional()
  @IsUrl()
  @Matches(GITHUB_PROFILE_URL_PATTERN, {
    message: 'githubUrl must be an HTTPS github.com profile URL',
  })
  // Preserve explicit null so clients can clear the field.
  @Transform(({ value }: { value: string | null }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  githubUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Experience level. Also settable via the onboarding endpoint.',
    enum: UserLevel,
    example: UserLevel.MIDDLE,
  })
  @IsOptional()
  @IsEnum(UserLevel)
  level?: UserLevel;

  @ApiPropertyOptional({ description: 'Enable or disable the fixed-time daily digest' })
  @IsOptional()
  @IsBoolean()
  dailyDigestEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable or disable the fixed-time weekly digest' })
  @IsOptional()
  @IsBoolean()
  weeklyDigestEnabled?: boolean;
}
