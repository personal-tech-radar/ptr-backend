import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { InfoPageService } from '../services/info-page.service';
import { QueryInfoPageDto } from '../dto/query-info-page.dto';
import { InfoPageResponseDto, InfoPageListItemDto } from '../dto/info-page-response.dto';
import { InfoPage } from '../entities/info-page.entity';

@ApiTags('Public Content')
@ApiSecurity('api-key')
@Controller('info-pages')
@UseGuards(ApiKeyGuard)
export class InfoPageController {
  constructor(private readonly service: InfoPageService) {}

  @Get()
  @ApiOperation({ summary: 'List published information pages' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  list(@Query() query: QueryInfoPageDto): Promise<PaginatedResponseDto<InfoPageListItemDto>> {
    return this.service.listPublic(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one published information page' })
  @ApiResponse({ status: 200, type: InfoPageResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  findOne(@Param('id') id: string): Promise<InfoPage> {
    return this.service.findPublic(id);
  }
}
