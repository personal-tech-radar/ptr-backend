import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { UserLevel } from '../entities/user.entity';

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
