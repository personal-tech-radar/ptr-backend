import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SourceCandidate,
  SourceCandidateDetectedType,
  SourceCandidateStatus,
} from '../entities/source-candidate.entity';

export class SourceCandidateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  normalizedUrl: string;

  @ApiProperty()
  domain: string;

  @ApiPropertyOptional()
  discoveredFromArticleId: string | null;

  @ApiPropertyOptional()
  seedKey: string | null;

  @ApiProperty({ enum: SourceCandidateStatus })
  status: SourceCandidateStatus;

  @ApiPropertyOptional({ enum: SourceCandidateDetectedType })
  detectedType: SourceCandidateDetectedType | null;

  @ApiPropertyOptional()
  proposedConfig: Record<string, unknown> | null;

  @ApiPropertyOptional()
  validationError: string | null;

  @ApiPropertyOptional()
  lastValidatedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// The controller's return types are DTOs, but the query/command services return raw TypeORM
// entities (no ClassSerializerInterceptor is registered globally — see ArticlesService for the
// same pattern). This mapper is the explicit entity -> DTO boundary so the wire shape actually
// matches what Swagger documents, without dragging in a repo-wide interceptor change.
export function toSourceCandidateResponseDto(
  candidate: SourceCandidate,
): SourceCandidateResponseDto {
  const dto = new SourceCandidateResponseDto();
  dto.id = candidate.id;
  dto.normalizedUrl = candidate.normalizedUrl;
  dto.domain = candidate.domain;
  dto.discoveredFromArticleId = candidate.discoveredFromArticleId;
  dto.seedKey = candidate.seedKey;
  dto.status = candidate.status;
  dto.detectedType = candidate.detectedType;
  dto.proposedConfig = candidate.proposedConfig;
  dto.validationError = candidate.validationError;
  dto.lastValidatedAt = candidate.lastValidatedAt;
  dto.createdAt = candidate.createdAt;
  dto.updatedAt = candidate.updatedAt;
  return dto;
}
