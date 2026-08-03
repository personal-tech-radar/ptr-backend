import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { ArticlesService } from '../services/articles.service';
import { Post } from '@nestjs/common';
import { ArticleAnalysisRetryService } from '../services/article-analysis-retry.service';

@ApiTags('Admin - Articles')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/articles')
export class AdminArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleAnalysisRetryService: ArticleAnalysisRetryService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List articles with pagination and filtering',
    description:
      'Returns administrative article records including processing and analysis state needed for operations, with pagination and practical filters.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(@Query() query: ArticleListQueryDto): Promise<PaginatedResponseDto<ArticleResponseDto>> {
    return this.articlesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single article by ID',
    description:
      'Returns complete administrative article details, including operational analysis fields that are intentionally omitted from public content DTOs.',
  })
  @ApiResponse({ status: 200, type: ArticleResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  findOne(@Param('id') id: string): Promise<ArticleResponseDto> {
    return this.articlesService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete an article',
    description:
      'Marks the article as deleted while preserving its persisted history for deduplication, audit, and related business records.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  remove(@Param('id') id: string): Promise<void> {
    return this.articlesService.remove(id);
  }

  @Post(':id/retry-analysis')
  @ApiOperation({
    summary: 'Retry global analysis for an article',
    description:
      'Coordinates a bounded deterministic BullMQ retry with a transactional article-status change. Retained completed or failed jobs are replaced, repeated executable retries are reused, and the article is not committed as pending unless recoverable queue work exists.',
  })
  @ApiResponse({ status: 201, description: 'Article analysis job accepted' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto, description: 'Article not found' })
  async retryAnalysis(@Param('id') id: string): Promise<{ accepted: true }> {
    await this.articleAnalysisRetryService.retry(id);
    return { accepted: true };
  }
}
