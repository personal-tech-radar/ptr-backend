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
import { AdminArticleFeedbackResponseDto } from '../dto/admin-article-feedback-response.dto';
import { AdminQueryArticleFeedbackDto } from '../dto/admin-query-article-feedback.dto';
import { ArticleFeedbackService } from '../services/article-feedback.service';

@ApiTags('Admin - Articles')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/article-feedback')
export class AdminArticleFeedbackController {
  constructor(private readonly articleFeedbackService: ArticleFeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'List article feedback across all users (admin only)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(
    @Query() query: AdminQueryArticleFeedbackDto,
  ): Promise<PaginatedResponseDto<AdminArticleFeedbackResponseDto>> {
    return this.articleFeedbackService.findAllAdmin(query);
  }
}
