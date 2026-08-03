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
import { AdminQuerySavedArticleDto } from '../dto/admin-query-saved-article.dto';
import { AdminSavedArticleResponseDto } from '../dto/admin-saved-article-response.dto';
import { SavedArticleService } from '../services/saved-article.service';

@ApiTags('Admin - User Actions')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/saved-articles')
export class AdminSavedArticleController {
  constructor(private readonly savedArticleService: SavedArticleService) {}

  @Get()
  @ApiOperation({
    summary: 'List saved articles across all users',
    description:
      'Read-only paginated view of user/article saved relationships for support and audit. This endpoint does not create, remove, or alter saved state.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(
    @Query() query: AdminQuerySavedArticleDto,
  ): Promise<PaginatedResponseDto<AdminSavedArticleResponseDto>> {
    return this.savedArticleService.findAllAdmin(query);
  }
}
