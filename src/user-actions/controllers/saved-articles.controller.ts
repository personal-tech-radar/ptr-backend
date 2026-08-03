import {
  Controller,
  Delete,
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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { QuerySavedArticleDto } from '../dto/query-saved-article.dto';
import {
  SavedArticleResponseDto,
  toSavedArticleResponseDto,
} from '../dto/saved-article-response.dto';
import { SavedArticleService } from '../services/saved-article.service';

@ApiTags('Saved Articles')
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(JwtAuthGuard)
@Controller('saved-articles')
export class SavedArticlesController {
  constructor(private readonly savedArticleService: SavedArticleService) {}

  @Post(':articleId')
  @ApiOperation({
    summary: 'Save an article for the current user',
    description:
      'JWT-protected interactive save operation. Creates at most one saved record and one source saved signal for the user/article pair; repeating the request is idempotent.',
  })
  @ApiResponse({ status: 201, type: SavedArticleResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'Malformed article UUID' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto, description: 'Article not found' })
  async save(
    @CurrentUser() user: CurrentUserPayload,
    @Param('articleId', new ParseUUIDPipe({ version: '4' })) articleId: string,
  ): Promise<SavedArticleResponseDto> {
    const entity = await this.savedArticleService.create(user.id, articleId);
    return toSavedArticleResponseDto(entity);
  }

  @Delete(':articleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove an article from the current user’s saved list',
    description:
      'Removes the current saved state and updates the saved source signal when present. Repeating the request succeeds without creating additional effects.',
  })
  @ApiResponse({ status: 204, description: 'Article unsaved (or already not saved)' })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'Malformed article UUID' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async unsave(
    @CurrentUser() user: CurrentUserPayload,
    @Param('articleId', new ParseUUIDPipe({ version: '4' })) articleId: string,
  ): Promise<void> {
    await this.savedArticleService.remove(user.id, articleId);
  }

  @Get()
  @ApiOperation({
    summary: "List the current user's saved articles",
    description:
      'Returns the authenticated user’s saved articles with pagination. No other user’s saved state is exposed.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: QuerySavedArticleDto,
  ): Promise<PaginatedResponseDto<SavedArticleResponseDto>> {
    return this.savedArticleService.findAll(user.id, query.page ?? 1, query.limit ?? 20);
  }
}
