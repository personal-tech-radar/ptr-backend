import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ApiProperty } from '@nestjs/swagger';
import { TechnologyInterest, TechnologyInterestKind } from '../entities/technology-interest.entity';

export class TechnologyInterestResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ enum: TechnologyInterestKind, example: TechnologyInterestKind.TECHNOLOGY })
  kind: TechnologyInterestKind;

  @ApiProperty({ example: 'Node.js' })
  name: string;

  @ApiProperty({
    description: 'Alternate names that resolve to this technology/interest',
    example: ['nodejs', 'node'],
    type: [String],
  })
  aliases: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export function toTechnologyInterestResponseDto(
  entity: TechnologyInterest,
): TechnologyInterestResponseDto {
  return {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    aliases: entity.aliases,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export class TechnologyCoverageCountsDto {
  @ApiProperty() active: number;
  @ApiProperty() degraded: number;
  @ApiProperty() disabled: number;
}

export class TechnologyRelatedStreamDto {
  @ApiProperty() id: string;
  @ApiProperty() key: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: TechnologyCoverageCountsDto }) coverage: TechnologyCoverageCountsDto;
}

export class AdminTechnologyInterestListItemDto extends TechnologyInterestResponseDto {
  @ApiProperty({ type: [TechnologyRelatedStreamDto] })
  relatedStreams: TechnologyRelatedStreamDto[];
  @ApiProperty({ type: TechnologyCoverageCountsDto })
  coverage: TechnologyCoverageCountsDto;
}

export class PaginatedTechnologyInterestResponseDto extends PaginatedResponseDto<AdminTechnologyInterestListItemDto> {
  @ApiProperty({ type: [AdminTechnologyInterestListItemDto] })
  declare data: AdminTechnologyInterestListItemDto[];
}
