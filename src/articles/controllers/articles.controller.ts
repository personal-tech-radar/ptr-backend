import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { ArticleFeedbackResponseDto } from '../dto/article-feedback-response.dto';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { CreateArticleFeedbackDto } from '../dto/create-article-feedback.dto';
import { ArticleFeedbackService } from '../services/article-feedback.service';
import { PublicArticlesService } from '../services/public-articles.service';
import { PublicArticleResponseDto } from '../dto/public-article-response.dto';

@ApiTags('Public Content')
@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly publicArticlesService: PublicArticlesService,
    private readonly articleFeedbackService: ArticleFeedbackService,
  ) {}

  @Get()
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'List public articles with pagination and filtering',
    description:
      'API-key content endpoint returning globally analyzed public article data, taxonomy, streams, source information, redirect URL, and public/personal click counters without personalized state or internal processing fields.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  findAll(
    @Query() query: ArticleListQueryDto,
  ): Promise<PaginatedResponseDto<PublicArticleResponseDto>> {
    return this.publicArticlesService.findAll(query);
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Get one public article by ID',
    description:
      'Returns renderable public metadata for an eligible globally analyzed article. The summary is concise list/digest text; longSummary is the detailed article-page explanation when available. Internal queue, validation, raw analysis, saved, feedback, and user-specific scoring fields are excluded.',
  })
  @ApiResponse({ status: 200, type: PublicArticleResponseDto })
  findOne(@Param('id') id: string): Promise<PublicArticleResponseDto> {
    return this.publicArticlesService.findOne(id);
  }

  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit or replace article feedback',
    description:
      'Stores the authenticated user’s current useful or not_useful value. Repeating the same value is idempotent; submitting the other value replaces it and updates personal/global source aggregates. Feedback cannot be deleted.',
  })
  @ApiResponse({ status: 200, type: ArticleFeedbackResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Malformed article UUID or body' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Article not found' })
  addFeedback(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateArticleFeedbackDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ArticleFeedbackResponseDto> {
    return this.articleFeedbackService.upsertFeedback(id, dto.type, user.id);
  }
}
