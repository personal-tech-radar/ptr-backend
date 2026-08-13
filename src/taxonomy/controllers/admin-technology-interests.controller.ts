import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import {
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

  @Get()
  @ApiOperation({
    summary: 'List technologies/interests with pagination and filtering',
    description:
      'Returns the unified taxonomy catalog with its technology/interest kind discriminator, aliases, merge state, and administrative filters.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(
    @Query() query: AdminQueryTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<TechnologyInterestResponseDto>> {
    const result = await this.technologyInterestQueryService.findAllForAdmin(query);
    return {
      data: result.data.map(toTechnologyInterestResponseDto),
      meta: result.meta,
    };
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
