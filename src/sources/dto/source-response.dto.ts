import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SourceCategory, SourceStatus, SourceType } from '../entities/source.entity';
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

  @ApiProperty({ enum: SourceStatus })
  status: SourceStatus;

  @ApiProperty()
  consecutiveFailures: number;

  @ApiPropertyOptional()
  lastSuccessfulFetchAt: Date | null;

  @ApiPropertyOptional()
  lastAttemptAt: Date | null;

  @ApiPropertyOptional()
  lastError: string | null;

  @ApiProperty()
  processedArticleCount: number;

  @ApiPropertyOptional()
  nextScheduledFetchAt?: Date | null;

  @ApiPropertyOptional({ type: [Object] })
  associatedTechnologies?: Array<{ id: string; name: string }>;

  @ApiPropertyOptional({ type: [Object] })
  associatedInterests?: Array<{ id: string; name: string }>;

  @ApiPropertyOptional({ type: [Object] })
  associatedStreams?: Array<{ id: string; key: string }>;

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
