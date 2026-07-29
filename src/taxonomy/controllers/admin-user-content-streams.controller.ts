import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { QueryUserContentStreamDto } from '../dto/query-user-content-stream.dto';
import { UserContentStreamResponseDto } from '../dto/user-content-stream-response.dto';
import { ContentStreamQueryService } from '../services/content-stream-query.service';

// Deliberately placed in Phase 8b (taxonomy) rather than Phase 8c (read-only admin) — this
// listing is a join over TaxonomyModule's own join table, so it lives with the rest of the
// content-stream admin surface for domain locality.
@ApiTags('Admin - Taxonomy')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/user-content-streams')
export class AdminUserContentStreamsController {
  constructor(private readonly contentStreamQueryService: ContentStreamQueryService) {}

  @Get()
  @ApiOperation({ summary: "List users' content-stream selections (admin only)" })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(
    @Query() query: QueryUserContentStreamDto,
  ): Promise<PaginatedResponseDto<UserContentStreamResponseDto>> {
    return this.contentStreamQueryService.findAllUserSelections(query);
  }
}
