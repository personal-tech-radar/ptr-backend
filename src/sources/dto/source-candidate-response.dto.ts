import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SourceCandidate,
  SourceCandidateDetectedType,
  SourceDiscoveryOrigin,
  SourceCandidateStatus,
} from '../entities/source-candidate.entity';
import { SourceType } from '../entities/source.entity';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export class SourceCandidateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  normalizedUrl: string;

  @ApiProperty()
  domain: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  seedKey: string | null;

  @ApiProperty({ enum: SourceDiscoveryOrigin })
  origin: SourceDiscoveryOrigin;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  technologyInterestId: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  technologyInterestName: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  contentStreamId: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  contentStreamName: string | null;

  @ApiPropertyOptional({ enum: SourceType, nullable: true })
  expectedSourceType: SourceType | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  proposedName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  relevanceReason: string | null;

  @ApiProperty({ enum: SourceCandidateStatus })
  status: SourceCandidateStatus;

  @ApiPropertyOptional({ enum: SourceCandidateDetectedType, nullable: true })
  detectedType: SourceCandidateDetectedType | null;

  @ApiPropertyOptional()
  proposedConfig: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  validationError: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectionCode: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  activatedSourceId: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastValidatedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedSourceCandidateResponseDto extends PaginatedResponseDto<SourceCandidateResponseDto> {
  @ApiProperty({ type: [SourceCandidateResponseDto] }) declare data: SourceCandidateResponseDto[];
}

// Explicit mapping keeps the wire shape aligned with Swagger without a global interceptor.
export function toSourceCandidateResponseDto(
  candidate: SourceCandidate,
): SourceCandidateResponseDto {
  const dto = new SourceCandidateResponseDto();
  dto.id = candidate.id;
  dto.normalizedUrl = candidate.normalizedUrl;
  dto.domain = candidate.domain;
  dto.seedKey = candidate.seedKey;
  dto.origin = candidate.origin;
  dto.technologyInterestId = candidate.technologyInterestId;
  dto.technologyInterestName = candidate.technologyInterest?.name ?? null;
  dto.contentStreamId = candidate.contentStreamId;
  dto.contentStreamName = candidate.contentStream?.name ?? null;
  dto.expectedSourceType = candidate.expectedSourceType;
  dto.proposedName = candidate.proposedName;
  dto.relevanceReason = candidate.relevanceReason;
  dto.status = candidate.status;
  dto.detectedType = candidate.detectedType;
  dto.proposedConfig = candidate.proposedConfig;
  dto.validationError = candidate.validationError;
  dto.rejectionCode = candidate.rejectionCode;
  dto.activatedSourceId = candidate.activatedSourceId;
  dto.lastValidatedAt = candidate.lastValidatedAt;
  dto.createdAt = candidate.createdAt;
  dto.updatedAt = candidate.updatedAt;
  return dto;
}
