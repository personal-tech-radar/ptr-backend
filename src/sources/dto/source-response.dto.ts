import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SourceCategory, SourceType } from '../entities/source.entity';
import { WebConfigResponseDto } from './web-config.dto';

export class SourceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ enum: SourceType })
  type: SourceType;

  @ApiProperty({ enum: SourceCategory })
  category: SourceCategory;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  trustScore: number;

  @ApiPropertyOptional()
  lastCheckedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Discovery/extraction configuration, present only for sources of type "web"',
    type: () => WebConfigResponseDto,
  })
  webConfig?: WebConfigResponseDto;
}
