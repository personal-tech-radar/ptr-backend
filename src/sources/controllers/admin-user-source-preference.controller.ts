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
import { AdminQueryUserSourcePreferenceDto } from '../dto/admin-query-user-source-preference.dto';
import {
  PaginatedUserSourcePreferenceResponseDto,
  UserSourcePreferenceResponseDto,
} from '../dto/user-source-preference-response.dto';
import { UserSourcePreferenceService } from '../services/user-source-preference.service';

@ApiTags('Admin - Sources')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/user-source-preferences')
export class AdminUserSourcePreferenceController {
  constructor(private readonly userSourcePreferenceService: UserSourcePreferenceService) {}

  @Get()
  @ApiOperation({
    summary: "List users' source interaction preferences",
    description:
      'Shows per-user, per-source interaction aggregates used to calculate the bounded personal source adjustment: unique useful, not-useful, saved, and opened counts plus the resulting adjustment. Filter by user email or source ID. This is derived personalization state, not an administrator-editable preference setting.',
  })
  @ApiResponse({
    status: 200,
    type: PaginatedUserSourcePreferenceResponseDto,
    description:
      'Paginated rows containing user and source identity, signal counts, and bounded feedback adjustment',
  })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(
    @Query() query: AdminQueryUserSourcePreferenceDto,
  ): Promise<PaginatedResponseDto<UserSourcePreferenceResponseDto>> {
    return this.userSourcePreferenceService.findAllAdmin(query);
  }
}
