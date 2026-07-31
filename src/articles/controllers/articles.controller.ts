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
import { ApiBearerAuth, ApiSecurity, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { ArticleFeedbackResponseDto } from '../dto/article-feedback-response.dto';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { CreateArticleFeedbackDto } from '../dto/create-article-feedback.dto';
import { ArticleFeedbackService } from '../services/article-feedback.service';
import { ArticlesService } from '../services/articles.service';

@ApiTags('Articles')
@ApiSecurity('api-key')
@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleFeedbackService: ArticleFeedbackService,
  ) {}

  @Get()
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'List articles with pagination and filtering' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  findAll(@Query() query: ArticleListQueryDto): Promise<PaginatedResponseDto<ArticleResponseDto>> {
    return this.articlesService.findAll(query);
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get a single article by ID' })
  @ApiResponse({ status: 200, type: ArticleResponseDto })
  findOne(@Param('id') id: string): Promise<ArticleResponseDto> {
    return this.articlesService.findOne(id);
  }

  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit or update feedback for an article' })
  @ApiResponse({ status: 200, type: ArticleFeedbackResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Article not found' })
  addFeedback(
    @Param('id') id: string,
    @Body() dto: CreateArticleFeedbackDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ArticleFeedbackResponseDto> {
    return this.articleFeedbackService.upsertFeedback(id, dto.type, user.id);
  }
}
