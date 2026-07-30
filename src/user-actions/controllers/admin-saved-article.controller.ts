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
import { AdminQuerySavedArticleDto } from '../dto/admin-query-saved-article.dto';
import { AdminSavedArticleResponseDto } from '../dto/admin-saved-article-response.dto';
import { SavedArticleService } from '../services/saved-article.service';

@ApiTags('Admin - User Actions')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/saved-articles')
export class AdminSavedArticleController {
  constructor(private readonly savedArticleService: SavedArticleService) {}

  @Get()
  @ApiOperation({ summary: 'List saved articles across all users (admin only)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(
    @Query() query: AdminQuerySavedArticleDto,
  ): Promise<PaginatedResponseDto<AdminSavedArticleResponseDto>> {
    return this.savedArticleService.findAllAdmin(query);
  }
}
