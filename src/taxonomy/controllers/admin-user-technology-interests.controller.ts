import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { QueryUserTechnologyInterestDto } from '../dto/query-user-technology-interest.dto';
import { UserTechnologyInterestResponseDto } from '../dto/user-technology-interest-response.dto';
import { TechnologyInterestQueryService } from '../services/technology-interest-query.service';

// Deliberately placed in Phase 8b (taxonomy) rather than Phase 8c (read-only admin) — this
// listing is a join over TaxonomyModule's own join table, so it lives with the rest of the
// technology/interest admin surface for domain locality.
@ApiTags('Admin - Taxonomy')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/user-technology-interests')
export class AdminUserTechnologyInterestsController {
  constructor(private readonly technologyInterestQueryService: TechnologyInterestQueryService) {}

  @Get()
  @ApiOperation({
    summary: "List users' technology/interest selections",
    description:
      'Returns paginated user-to-taxonomy relationships for support and auditing, with filters such as user email, taxonomy entry, and taxonomy kind. This endpoint is read-only.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(
    @Query() query: QueryUserTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<UserTechnologyInterestResponseDto>> {
    return this.technologyInterestQueryService.findAllUserSelections(query);
  }
}
