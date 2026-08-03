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

@ApiTags('Admin - Jobs')
@ApiBearerAuth('administrator-bearer')
@UseGuards(AdministratorAuthGuard)
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly queueService: QueueService) {}

  @Get('failed')
  @ApiOperation({
    summary: 'List failed BullMQ jobs',
    description:
      'Returns a paginated view of failed jobs across supported queues or one selected queue, including failure and timing details needed for operational diagnosis.',
  })
  @ApiResponse({ status: 200, description: 'Paginated failed-job records grouped by queue' })
  @ApiResponse({ status: 401, description: 'Invalid administrator token' })
  failed(@Query('queue') queue?: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.queueService.listFailedJobs(queue, Number(page), Number(limit));
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
