import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SourceCategory, SourceType } from '../entities/source.entity';
import { WebConfigDto } from './web-config.dto';

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

  @ApiPropertyOptional({
    description:
      'Web source discovery/extraction configuration, used only when type is "web". ' +
      "Optional: when omitted for a web source, the source's own `url` is used as the " +
      'sole entry point for discovery.',
    type: WebConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebConfigDto)
  webConfig?: WebConfigDto;
}
