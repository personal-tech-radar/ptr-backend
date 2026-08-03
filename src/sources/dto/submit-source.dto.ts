import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsUrl } from 'class-validator';

export class SubmitSourceDto {
  @ApiProperty({ example: 'https://example.com/feed' })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @Transform(({ value }: { value: string }) => value?.trim())
  url: string;
}

export enum SourceSubmissionOutcome {
  ACCEPTED = 'accepted_for_processing',
  ACTIVE = 'already_exists_active',
  DEGRADED = 'already_exists_degraded',
  DISABLED = 'already_exists_disabled',
  REJECTED = 'already_rejected',
}

export class SourceSubmissionResponseDto {
  @ApiProperty({ enum: SourceSubmissionOutcome })
  outcome: SourceSubmissionOutcome;

  @ApiProperty({ required: false })
  sourceId?: string;

  @ApiProperty({ required: false })
  candidateId?: string;

  @ApiProperty({ required: false })
  reason?: string;
}
