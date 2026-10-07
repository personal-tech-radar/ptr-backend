import {
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { QueueService } from '../services/queue.service';
import {
  AdminJobsQueryDto,
  AdminJobResponseDto,
  AdminQueueSummaryDto,
  PaginatedAdminJobsResponseDto,
} from '../dto/admin-jobs.dto';

@ApiTags('Admin - Jobs')
@ApiBearerAuth('administrator-bearer')
@UseGuards(AdministratorAuthGuard)
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly queueService: QueueService) {}

  @Get('summary')
  @ApiResponse({ status: 200, type: [AdminQueueSummaryDto] })
  @ApiOperation({ summary: 'Summarize real BullMQ queues by operational state' })
  summary() {
    return this.queueService.getAdminQueueSummary();
  }

  @Get()
  @ApiResponse({ status: 200, type: PaginatedAdminJobsResponseDto })
  @ApiOperation({ summary: 'List operational queue jobs without exposing payloads' })
  jobs(@Query() query: AdminJobsQueryDto) {
    return this.queueService.listAdminJobs(query.queue, query.state, query.page, query.limit);
  }

  @Get('failed')
  @ApiOperation({
    summary: 'List failed BullMQ jobs',
    description:
      'Returns a paginated view of failed jobs across supported queues or one selected queue, including failure and timing details needed for operational diagnosis.',
  })
  @ApiResponse({ status: 200, type: PaginatedAdminJobsResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid administrator token' })
  failed(@Query() query: AdminJobsQueryDto) {
    return this.queueService.listFailedJobs(query.queue, query.page, query.limit);
  }

  @Get(':queue/:jobId')
  @ApiResponse({ status: 200, type: AdminJobResponseDto })
  @ApiResponse({ status: 404, description: 'Queue or job not found' })
  @ApiOperation({ summary: 'Get a queue job operational detail without raw job payload' })
  async job(@Param('queue') queue: string, @Param('jobId') jobId: string) {
    return this.queueService.getAdminJob(queue, jobId);
  }

  @Delete(':queue/:jobId')
  @ApiOperation({
    summary: 'Cancel a safely removable queue job',
    description:
      'Cancels a job only when BullMQ reports it as pending, delayed, or paused. Active or completed work is not forcefully deleted, and queue history cannot be arbitrarily purged through this endpoint.',
  })
  @ApiResponse({ status: 200, description: 'Pending job cancelled' })
  @ApiResponse({ status: 401, description: 'Invalid administrator token' })
  @ApiResponse({ status: 409, description: 'Job is not in a safely cancellable state' })
  async cancel(@Param('queue') queue: string, @Param('jobId') jobId: string) {
    const cancelled = await this.queueService.cancelPendingJob(queue, jobId);
    if (!cancelled)
      throw new ConflictException('Only pending, delayed, or paused jobs can be cancelled safely');
    return { cancelled: true };
  }
}
