import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { CurrentAdmin } from '../../administrators/decorators/current-administrator.decorator';
import type { CurrentAdministrator } from '../../administrators/interfaces/current-administrator.interface';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { AdminQueryDigestDto } from '../dto/admin-query-digest.dto';
import {
  DigestDetailResponseDto,
  DigestResponseDto,
  toDigestDetailResponseDto,
} from '../dto/digest-response.dto';
import { DigestQueryService } from '../services/digest-query.service';
import { QueueService } from '../../queue/services/queue.service';
import { TriggerDigestDto } from '../dto/digest-response.dto';
import { DigestBootstrapService } from '../services/digest-bootstrap.service';

@ApiTags('Admin - Digests')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/digests')
export class AdminDigestController {
  constructor(
    private readonly digestQueryService: DigestQueryService,
    private readonly queueService: QueueService,
    private readonly digestBootstrapService: DigestBootstrapService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List digests with pagination and filtering',
    description:
      'Returns scheduled and administrator-preview digest records, statuses, periods, recipients, delivery mode, and temporary per-stream page links with pagination and operational filters.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(@Query() query: AdminQueryDigestDto): Promise<PaginatedResponseDto<DigestResponseDto>> {
    return this.digestQueryService.findAll(query);
  }

  @Post('trigger')
  @ApiOperation({
    summary: 'Build a target-user digest preview and deliver it to this administrator',
    description:
      'Builds content using the target user’s profile, stores it as an administrator preview, and queues delivery to the authenticated administrator. It is never sent to the target user and does not advance scheduled daily or weekly delivery periods.',
  })
  @ApiResponse({ status: 201, description: 'Administrator preview stored and delivery queued' })
  async trigger(
    @Body() dto: TriggerDigestDto,
    @CurrentAdmin() administrator: CurrentAdministrator,
  ): Promise<{ accepted: true; digestId: string }> {
    const digest = await this.digestBootstrapService.buildAdministratorPreview(
      dto.userId,
      dto.type,
      administrator.id,
      administrator.email,
    );
    await this.queueService.addResendDigestJob(digest.id);
    return { accepted: true, digestId: digest.id };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single digest with its items',
    description:
      'Returns the stored digest snapshot, selected article items, period, delivery state, statistics, temporary per-stream page links, and preview metadata when applicable.',
  })
  @ApiResponse({ status: 200, type: DigestDetailResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async findOne(@Param('id') id: string): Promise<DigestDetailResponseDto> {
    const digest = await this.digestQueryService.findByIdWithItems(id);
    return toDigestDetailResponseDto(digest);
  }

  @Post(':id/resend')
  @ApiOperation({
    summary: 'Resend a stored digest',
    description:
      'Queues delivery of the already generated digest using its stored recipient, content, action identifiers, and scheduled-or-preview mode. Content is not regenerated and period state is not shifted.',
  })
  @ApiResponse({ status: 201, description: 'Stored digest delivery queued' })
  @ApiResponse({ status: 404, type: ErrorResponseDto, description: 'Digest not found' })
  async resend(@Param('id') id: string): Promise<{ accepted: true }> {
    await this.digestQueryService.findById(id);
    await this.queueService.addResendDigestJob(id);
    return { accepted: true };
  }
}
