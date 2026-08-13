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
import { AdminArticleFeedbackResponseDto } from '../dto/admin-article-feedback-response.dto';
import { AdminQueryArticleFeedbackDto } from '../dto/admin-query-article-feedback.dto';
import { ArticleFeedbackService } from '../services/article-feedback.service';

@ApiTags('Admin - User Actions')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/article-feedback')
export class AdminArticleFeedbackController {
  constructor(private readonly articleFeedbackService: ArticleFeedbackService) {}

  @Get()
  @ApiOperation({
    summary: 'List article feedback across all users',
    description:
      'Read-only paginated view of each user/article current explicit useful or not_useful value for auditing and support. Administrators cannot edit or delete feedback here.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(
    @Query() query: AdminQueryArticleFeedbackDto,
  ): Promise<PaginatedResponseDto<AdminArticleFeedbackResponseDto>> {
    return this.articleFeedbackService.findAllAdmin(query);
  }
}
