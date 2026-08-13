import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { SourceCandidateListQueryDto } from '../dto/source-candidate-list-query.dto';
import {
  SourceCandidateResponseDto,
  toSourceCandidateResponseDto,
} from '../dto/source-candidate-response.dto';
import { SourceCandidatesQueryService } from '../services/source-candidates-query.service';
import { SourceCandidatesService } from '../services/source-candidates.service';

@ApiTags('Admin - Sources')
@ApiBearerAuth('administrator-bearer')
@UseGuards(AdministratorAuthGuard)
@Controller('admin/source-candidates')
export class SourceCandidatesController {
  constructor(
    private readonly sourceCandidatesService: SourceCandidatesService,
    private readonly sourceCandidatesQueryService: SourceCandidatesQueryService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List source candidates with pagination and status filter',
    description:
      'Returns candidate proposals from user submission or taxonomy discovery, including origin, requested stream, terminal status, linked source when activated, and specific rejection code and reason.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(
    @Query() query: SourceCandidateListQueryDto,
  ): Promise<PaginatedResponseDto<SourceCandidateResponseDto>> {
    const { data, meta } = await this.sourceCandidatesQueryService.findAll(query);
    return { data: data.map(toSourceCandidateResponseDto), meta };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single source candidate by ID',
    description:
      'Returns the persisted candidate, its discovery provenance, processing outcome, rejection details, and activated source relationship when available.',
  })
  @ApiResponse({ status: 200, type: SourceCandidateResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Source candidate not found' })
  async findOne(@Param('id') id: string): Promise<SourceCandidateResponseDto> {
    const candidate = await this.sourceCandidatesQueryService.findOne(id);
    return toSourceCandidateResponseDto(candidate);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry deterministic candidate validation and activation',
    description:
      'Re-runs the shared onboarding coordinator for an existing candidate. Validation, retries, identity resolution, deduplication, activation, and terminal rejection use the same flow as every discovery entry point.',
  })
  @ApiResponse({ status: 200, type: SourceCandidateResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Source candidate not found' })
  async retry(@Param('id') id: string): Promise<SourceCandidateResponseDto> {
    const candidate = await this.sourceCandidatesService.promote(id);
    return toSourceCandidateResponseDto(candidate);
  }
}
