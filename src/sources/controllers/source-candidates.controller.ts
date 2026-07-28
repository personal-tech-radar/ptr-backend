import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { RejectSourceCandidateDto } from '../dto/reject-source-candidate.dto';
import { SourceCandidateListQueryDto } from '../dto/source-candidate-list-query.dto';
import {
  SourceCandidateResponseDto,
  toSourceCandidateResponseDto,
} from '../dto/source-candidate-response.dto';
import { SourceCandidatesQueryService } from '../services/source-candidates-query.service';
import { SourceCandidatesService } from '../services/source-candidates.service';

@ApiTags('Source Candidates')
@ApiBearerAuth()
@ApiSecurity('api-key')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('source-candidates')
export class SourceCandidatesController {
  constructor(
    private readonly sourceCandidatesService: SourceCandidatesService,
    private readonly sourceCandidatesQueryService: SourceCandidatesQueryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List source candidates with pagination and status filter' })
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
  @ApiOperation({ summary: 'Get a single source candidate by ID' })
  @ApiResponse({ status: 200, type: SourceCandidateResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Source candidate not found' })
  async findOne(@Param('id') id: string): Promise<SourceCandidateResponseDto> {
    const candidate = await this.sourceCandidatesQueryService.findOne(id);
    return toSourceCandidateResponseDto(candidate);
  }

  @Post(':id/promote')
  @ApiOperation({
    summary:
      'Run structure discovery + sampled pre-analysis and promote the candidate to a real ' +
      'Source if enough sampled articles are relevant',
  })
  @ApiResponse({ status: 200, type: SourceCandidateResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Source candidate not found' })
  async promote(@Param('id') id: string): Promise<SourceCandidateResponseDto> {
    const candidate = await this.sourceCandidatesService.promote(id);
    return toSourceCandidateResponseDto(candidate);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Manually reject a source candidate' })
  @ApiResponse({ status: 200, type: SourceCandidateResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Source candidate not found' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectSourceCandidateDto,
  ): Promise<SourceCandidateResponseDto> {
    const candidate = await this.sourceCandidatesService.reject(id, dto.reason);
    return toSourceCandidateResponseDto(candidate);
  }
}
