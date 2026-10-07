import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export const ADMIN_QUEUE_NAMES = [
  'feed-fetch',
  'article-analysis',
  'digest',
  'web-source-browser-fetch',
  'taxonomy-source-discovery',
] as const;
export const ADMIN_JOB_STATES = [
  'waiting',
  'active',
  'delayed',
  'paused',
  'prioritized',
  'failed',
  'completed',
] as const;
export type AdminJobState = (typeof ADMIN_JOB_STATES)[number];
export class AdminJobsQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_QUEUE_NAMES })
  @IsOptional()
  @IsIn(ADMIN_QUEUE_NAMES)
  queue?: string;
  @ApiPropertyOptional({ enum: ADMIN_JOB_STATES })
  @IsOptional()
  @IsIn(ADMIN_JOB_STATES)
  state?: AdminJobState;
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
export class AdminJobReferenceDto {
  @ApiProperty({ enum: ['source', 'article', 'candidate', 'taxonomy', 'digest', 'user'] })
  type: string;
  @ApiProperty({ format: 'uuid' }) id: string;
}
export class AdminJobResponseDto {
  @ApiProperty({ enum: ADMIN_QUEUE_NAMES }) queue: string;
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty({ description: 'Legacy alias for job type.' }) name: string;
  @ApiProperty({ enum: [...ADMIN_JOB_STATES, 'unknown', 'waiting-children'] }) state: string;
  @ApiProperty({ description: 'Unix milliseconds' }) timestamp: number;
  @ApiProperty({ type: Number, nullable: true }) processedOn: number | null;
  @ApiProperty({ type: Number, nullable: true }) finishedOn: number | null;
  @ApiProperty() attemptsMade: number;
  @ApiProperty() attempts: number;
  @ApiProperty({ type: String, nullable: true }) failedReason: string | null;
  @ApiProperty({
    type: AdminJobReferenceDto,
    nullable: true,
    description:
      'Only a known subject ID. Sweep/cleanup jobs have no subject; unsent digest jobs may reference a user.',
  })
  reference: AdminJobReferenceDto | null;
}
export class PaginatedAdminJobsResponseDto extends PaginatedResponseDto<AdminJobResponseDto> {
  @ApiProperty({ type: [AdminJobResponseDto] }) declare data: AdminJobResponseDto[];
}
export class AdminQueueSummaryDto {
  @ApiProperty({ enum: ADMIN_QUEUE_NAMES }) queue: string;
  @ApiProperty() waiting: number;
  @ApiProperty() active: number;
  @ApiProperty() delayed: number;
  @ApiProperty() paused: number;
  @ApiProperty() prioritized: number;
  @ApiProperty() failed: number;
}
