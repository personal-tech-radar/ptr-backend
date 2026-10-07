import { ApiProperty } from '@nestjs/swagger';
import { SourceResponseDto } from './source-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminPeriodResponseDto } from '../../users/dto/user-analytics-response.dto';
import { SignalCountsDto } from '../../admin-dashboard/dto/dashboard-overview-response.dto';

export class AdminSourceResponseDto extends SourceResponseDto {
  @ApiProperty({ description: 'Persisted interaction score; unchanged domain calculation.' })
  interactionScore: number;
  @ApiProperty({ description: 'Sum of the four persisted signal counters.' })
  includedSignalCount: number;
  @ApiProperty({ description: 'Retained articles received in the response period.' })
  periodArticleCount: number;
}
export class PaginatedAdminSourceResponseDto extends PaginatedResponseDto<AdminSourceResponseDto> {
  @ApiProperty({ type: [AdminSourceResponseDto] }) declare data: AdminSourceResponseDto[];
  @ApiProperty({ type: AdminPeriodResponseDto }) period: AdminPeriodResponseDto;
}
export class SourceAttemptResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: [String] }) streamIds: string[];
  @ApiProperty() startedAt: Date;
  @ApiProperty({ type: Date, nullable: true }) completedAt: Date | null;
  @ApiProperty({ type: Boolean, nullable: true }) succeeded: boolean | null;
  @ApiProperty() publicationsProcessed: number;
  @ApiProperty({ type: String, nullable: true }) error: string | null;
}
export class SourceVolumeResponseDto {
  @ApiProperty() receivedArticles: number;
  @ApiProperty() totalArticles: number;
  @ApiProperty() attempts: number;
  @ApiProperty() successfulAttempts: number;
  @ApiProperty() failedAttempts: number;
  @ApiProperty() publicationsProcessed: number;
}
export class AdminSourceDetailResponseDto extends AdminSourceResponseDto {
  @ApiProperty({ type: AdminPeriodResponseDto }) period: AdminPeriodResponseDto;
  @ApiProperty({ type: SignalCountsDto }) signals: SignalCountsDto;
  @ApiProperty({ type: SourceVolumeResponseDto }) volume: SourceVolumeResponseDto;
  @ApiProperty({
    type: [SourceAttemptResponseDto],
    description:
      'Latest 20 retained ingestion attempts. Separate validation attempt history is not persisted; last validation is in webConfig.lastValidatedAt.',
  })
  recentAttempts: SourceAttemptResponseDto[];
}
