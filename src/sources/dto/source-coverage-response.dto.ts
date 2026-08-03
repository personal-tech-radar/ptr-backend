import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';

export class SourceCoverageResponseDto {
  @ApiProperty({ description: 'Technology or interest ID' })
  technologyInterestId: string;

  @ApiProperty({ description: 'Canonical technology or interest name' })
  name: string;

  @ApiProperty({ enum: TechnologyInterestKind, description: 'Taxonomy discriminator' })
  kind: TechnologyInterestKind;

  @ApiProperty({ description: 'Content stream ID' })
  streamId: string;

  @ApiProperty({ description: 'Stable content stream key' })
  streamKey: string;

  @ApiProperty({ description: 'Number of associated active sources' })
  activeSources: number;

  @ApiProperty({ description: 'Number of associated degraded sources' })
  degradedSources: number;

  @ApiProperty({ description: 'Number of associated disabled sources' })
  disabledSources: number;
}

export class PaginatedSourceCoverageResponseDto extends PaginatedResponseDto<SourceCoverageResponseDto> {
  @ApiProperty({ type: [SourceCoverageResponseDto] })
  declare data: SourceCoverageResponseDto[];
}
