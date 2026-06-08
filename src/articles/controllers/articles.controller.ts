import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ArticleFeedbackResponseDto } from '../dto/article-feedback-response.dto';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { CreateArticleFeedbackDto } from '../dto/create-article-feedback.dto';
import { ArticleFeedbackService } from '../services/article-feedback.service';
import { ArticlesService } from '../services/articles.service';

@ApiTags('Articles')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleFeedbackService: ArticleFeedbackService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List articles with pagination and filtering' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  findAll(
    @Query() query: ArticleListQueryDto,
  ): Promise<PaginatedResponseDto<ArticleResponseDto>> {
    return this.articlesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single article by ID' })
  @ApiResponse({ status: 200, type: ArticleResponseDto })
  findOne(@Param('id') id: string): Promise<ArticleResponseDto> {
    return this.articlesService.findOne(id);
  }

  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit or update feedback for an article' })
  @ApiResponse({ status: 200, type: ArticleFeedbackResponseDto })
  @ApiResponse({ status: 404, description: 'Article not found' })
  addFeedback(
    @Param('id') id: string,
    @Body() dto: CreateArticleFeedbackDto,
  ): Promise<ArticleFeedbackResponseDto> {
    return this.articleFeedbackService.upsertFeedback(id, dto.type);
  }
}
