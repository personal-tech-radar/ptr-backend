import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CreateInfoPageDto } from '../dto/create-info-page.dto';
import { InfoPageResponseDto, InfoPageListItemDto } from '../dto/info-page-response.dto';
import { QueryInfoPageDto } from '../dto/query-info-page.dto';
import { UpdateInfoPageDto } from '../dto/update-info-page.dto';
import { InfoPageService } from '../services/info-page.service';
import { InfoPage } from '../entities/info-page.entity';

@ApiTags('Admin - Info Pages')
@ApiBearerAuth('administrator-bearer')
@UseGuards(AdministratorAuthGuard)
@Controller('admin/info-pages')
export class AdminInfoPageController {
  constructor(private readonly service: InfoPageService) {}

  @Get()
  @ApiOperation({ summary: 'List information pages' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  list(@Query() query: QueryInfoPageDto): Promise<PaginatedResponseDto<InfoPageListItemDto>> {
    return this.service.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an information page' })
  @ApiResponse({ status: 200, type: InfoPageResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  findOne(@Param('id') id: string): Promise<InfoPage> {
    return this.service.findAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an information page' })
  @ApiResponse({ status: 201, type: InfoPageResponseDto })
  create(@Body() dto: CreateInfoPageDto): Promise<InfoPage> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an information page' })
  @ApiResponse({ status: 200, type: InfoPageResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateInfoPageDto): Promise<InfoPage> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an information page' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }
}
