import { PaginatedTechnologyInterestResponseDto } from '../dto/technology-interest-response.dto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { AdminQueryTechnologyInterestDto } from '../dto/admin-query-technology-interest.dto';
import { CreateTechnologyInterestDto } from '../dto/create-technology-interest.dto';
import { CreateTechnologyInterestResponseDto } from '../dto/create-technology-interest-response.dto';
import {
  AdminTechnologyInterestListItemDto,
  TechnologyInterestResponseDto,
  toTechnologyInterestResponseDto,
} from '../dto/technology-interest-response.dto';
import { UpdateTechnologyInterestDto } from '../dto/update-technology-interest.dto';
import { MergeTechnologyInterestDto } from '../dto/merge-technology-interest.dto';
import { TechnologyInterestCommandService } from '../services/technology-interest-command.service';
import { TechnologyInterestQueryService } from '../services/technology-interest-query.service';
import { TaxonomySourceDiscoveryRetryService } from '../services/taxonomy-source-discovery-retry.service';

@ApiTags('Admin - Taxonomy')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/technology-interests')
export class AdminTechnologyInterestsController {
  constructor(
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly technologyInterestCommandService: TechnologyInterestCommandService,
    private readonly discoveryRetryService: TaxonomySourceDiscoveryRetryService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create or reuse a technology or interest',
    description:
      'Creates a new taxonomy entry and queues source discovery. An exact, alias, or similarity match returns the existing entry without creating or queuing duplicate discovery work.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: CreateTechnologyInterestResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async create(
    @Body() dto: CreateTechnologyInterestDto,
  ): Promise<CreateTechnologyInterestResponseDto> {
    const { entity, created } = await this.technologyInterestCommandService.createForAdmin(
      dto.kind,
      dto.name,
    );
    return {
      created,
      message: created
        ? 'Technology/interest created and source discovery queued'
        : 'Technology/interest already exists; source discovery was not queued',
      taxonomy: toTechnologyInterestResponseDto(entity),
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List technologies/interests with pagination and filtering',
    description:
      'Returns the unified taxonomy catalog with its technology/interest kind discriminator, aliases, merge state, and administrative filters.',
  })
  @ApiResponse({ status: 200, type: PaginatedTechnologyInterestResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(
    @Query() query: AdminQueryTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<AdminTechnologyInterestListItemDto>> {
    return this.technologyInterestQueryService.findAdminList(query);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a technology/interest name or aliases',
    description:
      'Updates canonical display data while preserving the taxonomy kind and existing user/source relationships. Conflicting normalized names are rejected.',
  })
  @ApiResponse({ status: 200, type: TechnologyInterestResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'Another technology/interest already uses the requested name',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTechnologyInterestDto,
  ): Promise<TechnologyInterestResponseDto> {
    const entity = await this.technologyInterestCommandService.update(id, dto);
    return toTechnologyInterestResponseDto(entity);
  }

  @Post(':id/discover-sources')
  @ApiOperation({
    summary: 'Start source discovery for a taxonomy entry',
    description:
      'Enqueues one deterministic LLM proposal job for the selected technology or interest. Proposed sources still pass through the shared candidate onboarding coordinator; the request does not fetch sources inline.',
  })
  @ApiResponse({ status: 201, description: 'Discovery job accepted' })
  @ApiResponse({ status: 404, type: ErrorResponseDto, description: 'Taxonomy entry not found' })
  async discoverSources(@Param('id') id: string): Promise<{ accepted: true }> {
    await this.discoveryRetryService.retry(id);
    return { accepted: true };
  }

  @Post('merge')
  @ApiOperation({
    summary: 'Merge duplicate taxonomy entries',
    description:
      'Moves user selections and safe taxonomy relationships from the loser into the winner in one domain transaction, then records the loser as merged. Technologies and interests cannot be merged across kinds.',
  })
  @ApiResponse({ status: 201, type: TechnologyInterestResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'Entries cannot be merged' })
  async merge(@Body() dto: MergeTechnologyInterestDto): Promise<TechnologyInterestResponseDto> {
    const entity = await this.technologyInterestCommandService.merge(dto.winnerId, dto.loserId);
    return toTechnologyInterestResponseDto(entity);
  }
}
