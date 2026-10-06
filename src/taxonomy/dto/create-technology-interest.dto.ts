import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { TechnologyInterestKind } from '../entities/technology-interest.entity';

export class CreateTechnologyInterestDto {
  @ApiProperty({ enum: TechnologyInterestKind, example: TechnologyInterestKind.TECHNOLOGY })
  @IsEnum(TechnologyInterestKind)
  kind: TechnologyInterestKind;

  @ApiProperty({ description: 'Technology or interest name', example: 'OpenTelemetry' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;
}
