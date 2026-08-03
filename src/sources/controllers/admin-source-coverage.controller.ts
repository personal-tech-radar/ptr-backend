import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { QuerySourceCoverageDto } from '../dto/query-source-coverage.dto';
import { PaginatedSourceCoverageResponseDto } from '../dto/source-coverage-response.dto';
import { SourceCoverageQueryService } from '../services/source-coverage-query.service';

@ApiTags('Admin - Sources')
@ApiBearerAuth('administrator-bearer')
@UseGuards(AdministratorAuthGuard)
@Controller('admin/source-coverage')
export class AdminSourceCoverageController {
  constructor(private readonly coverageService: SourceCoverageQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'Inspect taxonomy source coverage',
    description:
      'Returns paginated coverage rows for technology/interest and stream relationships, including active, degraded, and disabled source counts. Filters support taxonomy entry, kind, stream, source status, minimum active count, and entries with zero active coverage. Interest coverage excludes releases and security.',
  })
  @ApiResponse({
    status: 200,
    type: PaginatedSourceCoverageResponseDto,
    description: 'Paginated source coverage rows and lifecycle counts',
  })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(@Query() query: QuerySourceCoverageDto) {
    return this.coverageService.findAll(query);
  }
}
