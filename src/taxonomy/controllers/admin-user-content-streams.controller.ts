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
import { QueryUserContentStreamDto } from '../dto/query-user-content-stream.dto';
import { UserContentStreamResponseDto } from '../dto/user-content-stream-response.dto';
import { ContentStreamQueryService } from '../services/content-stream-query.service';

// Deliberately placed in Phase 8b (taxonomy) rather than Phase 8c (read-only admin) — this
// listing is a join over TaxonomyModule's own join table, so it lives with the rest of the
// content-stream admin surface for domain locality.
@ApiTags('Admin - Taxonomy')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/user-content-streams')
export class AdminUserContentStreamsController {
  constructor(private readonly contentStreamQueryService: ContentStreamQueryService) {}

  @Get()
  @ApiOperation({
    summary: "List users' content-stream selections",
    description:
      'Returns paginated user-to-stream selections used by personal feeds and digests, with administrative filtering. This endpoint is read-only.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(
    @Query() query: QueryUserContentStreamDto,
  ): Promise<PaginatedResponseDto<UserContentStreamResponseDto>> {
    return this.contentStreamQueryService.findAllUserSelections(query);
  }
}
