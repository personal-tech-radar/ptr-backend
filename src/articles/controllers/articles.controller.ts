import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { ArticlesService } from '../services/articles.service';

@ApiTags('Articles')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

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
}
