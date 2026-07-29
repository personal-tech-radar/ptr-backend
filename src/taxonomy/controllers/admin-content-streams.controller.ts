import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { AdminQueryContentStreamDto } from '../dto/admin-query-content-stream.dto';
import {
  ContentStreamResponseDto,
  toContentStreamResponseDto,
} from '../dto/content-stream-response.dto';
import { UpdateContentStreamDto } from '../dto/update-content-stream.dto';
import { ContentStreamCommandService } from '../services/content-stream-command.service';
import { ContentStreamQueryService } from '../services/content-stream-query.service';

@ApiTags('Admin - Taxonomy')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/content-streams')
export class AdminContentStreamsController {
  constructor(
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly contentStreamCommandService: ContentStreamCommandService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List content streams, optionally including disabled ones (admin only)',
  })
  @ApiResponse({ status: 200, type: [ContentStreamResponseDto] })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(@Query() query: AdminQueryContentStreamDto): Promise<ContentStreamResponseDto[]> {
    const streams = await this.contentStreamQueryService.findAll(!query.includeDisabled);
    return streams.map(toContentStreamResponseDto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a content stream name/description/sortOrder/enabled (admin only)',
  })
  @ApiResponse({ status: 200, type: ContentStreamResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContentStreamDto,
  ): Promise<ContentStreamResponseDto> {
    const entity = await this.contentStreamCommandService.update(id, dto);
    return toContentStreamResponseDto(entity);
  }
}
