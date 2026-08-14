import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PipelineStatisticsDto {
  @ApiProperty({ example: 'Last 24h', description: 'Reporting window label.' })
  period: string;

  @ApiProperty({ example: 540, description: 'Currently active, non-deleted sources.' })
  activeSources: number;

  @ApiProperty({ example: 5324, description: 'Articles collected during the reporting window.' })
  articlesCollected: number;

  @ApiProperty({
    example: 3245,
    description: 'Articles fully analyzed during the reporting window.',
  })
  articlesAnalyzed: number;

  @ApiPropertyOptional({
    example: 256,
    nullable: true,
    description:
      'Articles selected by the submitted preview profile. Null for the standalone statistics endpoint.',
  })
  selectedForRadar: number | null;
}
