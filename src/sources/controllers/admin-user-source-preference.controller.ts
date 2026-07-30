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
import { AdminQueryUserSourcePreferenceDto } from '../dto/admin-query-user-source-preference.dto';
import { UserSourcePreferenceResponseDto } from '../dto/user-source-preference-response.dto';
import { UserSourcePreferenceService } from '../services/user-source-preference.service';

@ApiTags('Admin - Sources')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/user-source-preferences')
export class AdminUserSourcePreferenceController {
  constructor(private readonly userSourcePreferenceService: UserSourcePreferenceService) {}

  @Get()
  @ApiOperation({ summary: "List users' source preferences (admin only)" })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(
    @Query() query: AdminQueryUserSourcePreferenceDto,
  ): Promise<PaginatedResponseDto<UserSourcePreferenceResponseDto>> {
    return this.userSourcePreferenceService.findAllAdmin(query);
  }
}
