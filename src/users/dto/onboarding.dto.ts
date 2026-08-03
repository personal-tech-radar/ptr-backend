import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsTimeZone,
  IsOptional,
  IsUrl,
  Matches,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { UserLevel } from '../entities/user.entity';
import { GITHUB_PROFILE_URL_PATTERN } from './update-profile.dto';

export class TechnologyInterestSelectionDto {
  @ApiProperty({ enum: TechnologyInterestKind, example: TechnologyInterestKind.TECHNOLOGY })
  @IsEnum(TechnologyInterestKind)
  kind: TechnologyInterestKind;

  @ApiProperty({ description: 'Technology or interest name', example: 'Node.js' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;
}

export class OnboardingDto {
  @ApiProperty({ description: 'Browser IANA timezone', example: 'Europe/Berlin' })
  @IsTimeZone()
  @Transform(({ value }: { value: string }) => value?.trim())
  timezone: string;

  @ApiProperty({
    description: 'Optional HTTPS github.com profile URL',
    example: 'https://github.com/janedoe',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUrl()
  @Matches(GITHUB_PROFILE_URL_PATTERN, {
    message: 'githubUrl must be an HTTPS github.com profile URL',
  })
  @Transform(({ value }: { value: string | null }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  githubUrl?: string | null;

  @ApiProperty({ enum: UserLevel, example: UserLevel.MIDDLE })
  @IsEnum(UserLevel)
  level: UserLevel;

  @ApiProperty({
    description:
      'Technologies/interests selected during onboarding. Each is resolved against the ' +
      'existing taxonomy (exact/alias/similarity match) or created if genuinely new.',
    type: [TechnologyInterestSelectionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TechnologyInterestSelectionDto)
  technologyInterests: TechnologyInterestSelectionDto[];

  @ApiProperty({
    description: 'IDs of existing, enabled content streams selected during onboarding',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  contentStreamIds: string[];
}
