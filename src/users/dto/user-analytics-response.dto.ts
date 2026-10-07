import { ApiProperty } from '@nestjs/swagger';

export class AdminPeriodResponseDto {
  @ApiProperty({ enum: ['24h', '7d', '30d'] }) value: '24h' | '7d' | '30d';
  @ApiProperty() from: Date;
  @ApiProperty() to: Date;
  @ApiProperty() dauFrom: Date;
  @ApiProperty() wauFrom: Date;
  @ApiProperty() mauFrom: Date;
  @ApiProperty() semantics: string;
}

export class PopularityItemDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({
    description:
      'Current users selecting this taxonomy/stream, or having nonzero source signals. Not a historical subscription count.',
  })
  selectedUsers: number;
  @ApiProperty() activeUsers: number;
  @ApiProperty() opens: number;
  @ApiProperty() saves: number;
  @ApiProperty() usefulFeedback: number;
  @ApiProperty() notUsefulFeedback: number;
}
export class UserPopularityResponseDto {
  @ApiProperty({
    description:
      'Top 20 per dimension by period active users, then current selections, then name/ID.',
  })
  semantics: string;
  @ApiProperty({ type: [PopularityItemDto] }) technologies: PopularityItemDto[];
  @ApiProperty({ type: [PopularityItemDto] }) interests: PopularityItemDto[];
  @ApiProperty({ type: [PopularityItemDto] }) streams: PopularityItemDto[];
  @ApiProperty({ type: [PopularityItemDto] }) sources: PopularityItemDto[];
}

export class UserAnalyticsResponseDto {
  @ApiProperty({ type: () => UserPopularityResponseDto }) popularity: UserPopularityResponseDto;
  @ApiProperty({ type: AdminPeriodResponseDto }) period: AdminPeriodResponseDto;
  @ApiProperty({ description: 'All retained non-deleted users' }) registered: number;
  @ApiProperty({ description: 'Users currently verified' }) verified: number;
  @ApiProperty({ description: 'Users with completed onboarding' }) onboardingCompleted: number;
  @ApiProperty({ description: 'Registrations during period' }) registrations: number;
  @ApiProperty({ description: 'Verification timestamps during period' }) verifications: number;
  @ApiProperty({ description: 'Onboarding timestamps during period' })
  onboardingCompletions: number;
  @ApiProperty({ description: 'Unique active users in current UTC day' }) dau: number;
  @ApiProperty({ description: 'Unique active users in rolling seven days' }) wau: number;
  @ApiProperty({ description: 'Unique active users in rolling thirty days' }) mau: number;
  @ApiProperty({ description: 'Unique active users in selected period' }) activeUsers: number;
  @ApiProperty({ description: 'Retained first user/article opens' }) opens: number;
  @ApiProperty({ description: 'Currently saved articles created during period' }) saves: number;
  @ApiProperty({ description: 'Current useful feedback last updated during period' })
  usefulFeedback: number;
  @ApiProperty({ description: 'Current not-useful feedback last updated during period' })
  notUsefulFeedback: number;
}
