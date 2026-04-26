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
  UseGuards,
} from '@nestjs/common';
import {
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CreateSourceDto } from '../dto/create-source.dto';
import { SourceResponseDto } from '../dto/source-response.dto';
import { UpdateSourceDto } from '../dto/update-source.dto';
import { SourcesService } from '../services/sources.service';

@ApiTags('Sources')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  @ApiOperation({ summary: 'List all active sources' })
  @ApiResponse({ status: 200, type: [SourceResponseDto] })
  findAll(): Promise<SourceResponseDto[]> {
    return this.sourcesService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Add a new source' })
  @ApiResponse({ status: 201, type: SourceResponseDto })
  @ApiResponse({ status: 409, description: 'URL already exists' })
  create(@Body() dto: CreateSourceDto): Promise<SourceResponseDto> {
    return this.sourcesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a source' })
  @ApiResponse({ status: 200, type: SourceResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSourceDto,
  ): Promise<SourceResponseDto> {
    return this.sourcesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a source' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    return this.sourcesService.remove(id);
  }
}
