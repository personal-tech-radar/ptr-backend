import { ApiProperty } from '@nestjs/swagger';
import {
  AdminPeriodResponseDto,
  UserAnalyticsResponseDto,
} from '../../users/dto/user-analytics-response.dto';

export class LifecycleCountsDto {
  @ApiProperty() active: number;
  @ApiProperty() degraded: number;
  @ApiProperty() disabled: number;
}

export class ArticleCountsDto {
  @ApiProperty() total: number;
  @ApiProperty() new: number;
  @ApiProperty() duplicate: number;
  @ApiProperty() pending_analysis: number;
  @ApiProperty() analyzed: number;
  @ApiProperty() rejected: number;
  @ApiProperty() failed: number;
  @ApiProperty() skipped: number;
}

export class CandidateCountsDto {
  @ApiProperty() total: number;
  @ApiProperty() pending: number;
  @ApiProperty() active: number;
  @ApiProperty() rejected: number;
}

export class DigestCountsDto {
  @ApiProperty() total: number;
  @ApiProperty() sent: number;
  @ApiProperty() failed: number;
  @ApiProperty() draft: number;
  @ApiProperty() skipped_empty: number;
}

export class SignalCountsDto {
  @ApiProperty() opened: number;
  @ApiProperty() saved: number;
  @ApiProperty() useful: number;
  @ApiProperty() notUseful: number;
  @ApiProperty() total: number;
}

export class SourceTypeOverviewDto {
  @ApiProperty({ enum: ['feeds', 'web', 'github_release'] }) group: string;
  @ApiProperty({ type: [String] }) types: string[];
  @ApiProperty() total: number;
  @ApiProperty() created: number;
  @ApiProperty({ type: LifecycleCountsDto }) lifecycle: LifecycleCountsDto;
  @ApiProperty() receivedArticles: number;
  @ApiProperty() totalArticles: number;
  @ApiProperty({
    type: SignalCountsDto,
    description: 'All-time persisted source signals; score is not recalculated.',
  })
  signals: SignalCountsDto;
}
export class DashboardContentDto {
  @ApiProperty() sourcesCreated: number;
  @ApiProperty() totalSources: number;
  @ApiProperty({ type: LifecycleCountsDto }) sourceLifecycle: LifecycleCountsDto;
  @ApiProperty() receivedArticles: number;
  @ApiProperty() totalArticles: number;
  @ApiProperty() pendingAnalysis: number;
  @ApiProperty() analyzed: number;
  @ApiProperty() failed: number;
  @ApiProperty({
    type: ArticleCountsDto,
    description: 'Current statuses of articles received in the period.',
  })
  articlesPeriod: ArticleCountsDto;
  @ApiProperty({ type: ArticleCountsDto }) articlesAllTime: ArticleCountsDto;
  @ApiProperty({ type: CandidateCountsDto }) sourceCandidates: CandidateCountsDto;
  @ApiProperty({ type: CandidateCountsDto }) sourceCandidatesPeriod: CandidateCountsDto;
}
export class DashboardDigestsDto {
  @ApiProperty({
    type: DigestCountsDto,
    description:
      'Current sent records by sentAt; failed records by latest updatedAt (no failure history exists); draft/skipped records by createdAt. Counts records, not delivery attempts.',
  })
  period: DigestCountsDto;
  @ApiProperty({ type: DigestCountsDto }) allTime: DigestCountsDto;
}
export class DashboardBackendDto {
  @ApiProperty() appName: string;
  @ApiProperty() environment: string;
  @ApiProperty() status: string;
  @ApiProperty() uptime: number;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Latest successful source fetch; null when none is recorded.',
  })
  lastSuccessfulUpdateAt: Date | null;
}
export class DashboardOverviewResponseDto {
  @ApiProperty({ type: AdminPeriodResponseDto }) period: AdminPeriodResponseDto;
  @ApiProperty({ type: UserAnalyticsResponseDto }) users: UserAnalyticsResponseDto;
  @ApiProperty({ type: DashboardContentDto }) content: DashboardContentDto;
  @ApiProperty({ type: [SourceTypeOverviewDto] }) sourceTypes: SourceTypeOverviewDto[];
  @ApiProperty({ type: DashboardDigestsDto }) digests: DashboardDigestsDto;
  @ApiProperty({ type: DashboardBackendDto }) backend: DashboardBackendDto;
}
