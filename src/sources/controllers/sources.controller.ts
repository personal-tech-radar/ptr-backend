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
import { ApiBearerAuth, ApiSecurity, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { CreateSourceDto } from '../dto/create-source.dto';
import { QuerySourceDto } from '../dto/query-source.dto';
import { SourceResponseDto } from '../dto/source-response.dto';
import { UpdateSourceDto } from '../dto/update-source.dto';
import { SourcesService } from '../services/sources.service';

@ApiTags('Sources')
@ApiBearerAuth()
@ApiSecurity('api-key')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  @ApiOperation({ summary: 'List sources with pagination and filtering (admin only)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(@Query() query: QuerySourceDto): Promise<PaginatedResponseDto<SourceResponseDto>> {
    return this.sourcesService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new source' })
  @ApiResponse({ status: 201, type: SourceResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'URL already exists' })
  create(@Body() dto: CreateSourceDto): Promise<SourceResponseDto> {
    return this.sourcesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a source' })
  @ApiResponse({ status: 200, type: SourceResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto): Promise<SourceResponseDto> {
    return this.sourcesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a source' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async remove(@Param('id') id: string): Promise<void> {
    return this.sourcesService.remove(id);
  }
}
