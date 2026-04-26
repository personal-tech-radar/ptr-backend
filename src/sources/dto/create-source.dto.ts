import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { SourceCategory, SourceType } from '../entities/source.entity';

export class CreateSourceDto {
  @ApiProperty({ example: 'Cloudflare Blog' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'https://blog.cloudflare.com/rss/' })
  @IsUrl()
  url: string;

  @ApiProperty({ enum: SourceType })
  @IsEnum(SourceType)
  type: SourceType;

  @ApiProperty({ enum: SourceCategory })
  @IsEnum(SourceCategory)
  category: SourceCategory;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 50, minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  trustScore?: number;
}
