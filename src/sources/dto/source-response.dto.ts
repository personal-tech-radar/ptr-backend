import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SourceCategory, SourceStatus, SourceType } from '../entities/source.entity';
import { WebConfigResponseDto } from './web-config.dto';

export class SourceTaxonomyReferenceDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}
export class SourceStreamReferenceDto {
  @ApiProperty() id: string;
  @ApiProperty() key: string;
}

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

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastSuccessfulFetchAt: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastAttemptAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastError: string | null;

  @ApiProperty()
  processedArticleCount: number;

  @ApiPropertyOptional()
  nextScheduledFetchAt?: Date | null;

  @ApiPropertyOptional({ type: [SourceTaxonomyReferenceDto] })
  associatedTechnologies?: Array<{ id: string; name: string }>;

  @ApiPropertyOptional({ type: [SourceTaxonomyReferenceDto] })
  associatedInterests?: Array<{ id: string; name: string }>;

  @ApiPropertyOptional({ type: [SourceStreamReferenceDto] })
  associatedStreams?: Array<{ id: string; key: string }>;

  @ApiProperty()
  trustScore: number;

  @ApiPropertyOptional({ type: Date, nullable: true })
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
