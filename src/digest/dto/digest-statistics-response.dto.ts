import { ApiProperty } from '@nestjs/swagger';

export class DigestStatisticsResponseDto {
  @ApiProperty() windowHours: number;
  @ApiProperty() articlesIngested: number;
  @ApiProperty() articlesPassedPreanalysis: number;
  @ApiProperty() articlesAnalyzed: number;
  @ApiProperty() totalArticlesInDb: number;
  @ApiProperty() totalSourcesActive: number;
  @ApiProperty() feedSourcesActive: number;
  @ApiProperty() webSourcesActive: number;
  @ApiProperty() sourceCandidatesPending: number;
  @ApiProperty() sourcesProcessed: number;
  @ApiProperty() publicationsProcessed: number;
  @ApiProperty() publicationsIncluded: number;
  @ApiProperty() degradedSources: number;
  @ApiProperty() disabledSources: number;
}
export class DigestBuildAttemptResponseDto {
  @ApiProperty() windowHours: number;
  @ApiProperty() candidatesFound: number;
  @ApiProperty() eligibleFound: number;
}
export class DigestBuildDebugResponseDto {
  @ApiProperty() requestedItemCount: number;
  @ApiProperty() fallbackUsed: boolean;
  @ApiProperty({ type: [DigestBuildAttemptResponseDto] }) attempts: DigestBuildAttemptResponseDto[];
  @ApiProperty() finalWindowHours: number;
  @ApiProperty() finalSelectedCount: number;
}
