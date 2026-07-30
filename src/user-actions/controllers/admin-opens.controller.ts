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
import { AdminOpensResponseDto } from '../dto/admin-opens-response.dto';
import { AdminQueryOpensDto } from '../dto/admin-query-opens.dto';
import { PersonalArticleLinkService } from '../services/personal-article-link.service';

@ApiTags('Admin - User Actions')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/opens')
export class AdminOpensController {
  constructor(private readonly personalArticleLinkService: PersonalArticleLinkService) {}

  @Get()
  @ApiOperation({ summary: 'List personal article link opens across all users (admin only)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(
    @Query() query: AdminQueryOpensDto,
  ): Promise<PaginatedResponseDto<AdminOpensResponseDto>> {
    return this.personalArticleLinkService.findAllAdmin(query);
  }
}
