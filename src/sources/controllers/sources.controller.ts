import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { CreateSourceDto } from '../dto/create-source.dto';
import { QuerySourceDto } from '../dto/query-source.dto';
import { SourceResponseDto } from '../dto/source-response.dto';
import { UpdateSourceDto } from '../dto/update-source.dto';
import { SourcesService } from '../services/sources.service';

@ApiTags('Admin - Sources')
@ApiBearerAuth('administrator-bearer')
@UseGuards(AdministratorAuthGuard)
@Controller('admin/sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  @ApiOperation({
    summary: 'List sources with pagination and filtering',
    description:
      'Returns global sources with lifecycle, health, ingestion, web configuration, associated taxonomy, and stream details. Supports operational filters and optional inclusion of soft-deleted records.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(@Query() query: QuerySourceDto): Promise<PaginatedResponseDto<SourceResponseDto>> {
    return this.sourcesService.findAll(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create and validate a source directly',
    description:
      'Administrative direct-create operation. RSS/Atom sources are fetched and validated before persistence; web sources run entry-point discovery and extraction configuration validation. This does not start LLM source discovery or create a source candidate—use taxonomy discovery or the user submission flow for candidate-based onboarding.',
  })
  @ApiResponse({ status: 201, type: SourceResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'URL already exists' })
  create(@Body() dto: CreateSourceDto): Promise<SourceResponseDto> {
    return this.sourcesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a source',
    description:
      'Updates editable source metadata and web extraction configuration. It does not ingest the source or re-run candidate onboarding automatically.',
  })
  @ApiResponse({ status: 200, type: SourceResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto): Promise<SourceResponseDto> {
    return this.sourcesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete a source',
    description:
      'Marks the source as deleted while preserving articles, historical ingestion data, and business-significant source records.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async remove(@Param('id') id: string): Promise<void> {
    return this.sourcesService.remove(id);
  }

  @Post(':id/retry-validation')
  @ApiOperation({
    summary: 'Retry source validation',
    description:
      'Revalidates the existing source using its configured RSS or web discovery/extraction path and updates its validation state. This is an administrative recovery operation, not LLM discovery.',
  })
  retryValidation(@Param('id') id: string) {
    return this.sourcesService.retryValidation(id);
  }

  @Post(':id/retry-ingestion')
  @ApiOperation({
    summary: 'Enqueue source ingestion retry',
    description:
      'Queues an immediate ingestion attempt for this source using the existing ingestion pipeline and idempotency rules. Heavy fetching and analysis do not run in the request.',
  })
  async retryIngestion(@Param('id') id: string): Promise<{ accepted: true }> {
    await this.sourcesService.retryIngestion(id);
    return { accepted: true };
  }

  @Post(':id/activate')
  @ApiOperation({
    summary: 'Activate or recover a source',
    description:
      'Sets the source lifecycle to active and resets consecutive failures, allowing the scheduler to include a previously degraded or disabled source again.',
  })
  activate(@Param('id') id: string) {
    return this.sourcesService.activate(id);
  }

  @Post(':id/disable')
  @ApiOperation({
    summary: 'Disable a source',
    description:
      'Sets the source lifecycle to disabled. Disabled sources are excluded from automatic ingestion until an administrator activates or retries them.',
  })
  disable(@Param('id') id: string) {
    return this.sourcesService.disable(id);
  }
}
