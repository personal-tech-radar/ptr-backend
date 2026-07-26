import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import {
  ContentStreamResponseDto,
  toContentStreamResponseDto,
} from '../dto/content-stream-response.dto';
import { ContentStreamQueryService } from '../services/content-stream-query.service';

@ApiTags('Taxonomy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('content-streams')
export class ContentStreamController {
  constructor(private readonly contentStreamQueryService: ContentStreamQueryService) {}

  @Get()
  @ApiOperation({ summary: 'List enabled content streams' })
  @ApiResponse({ status: 200, type: [ContentStreamResponseDto] })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async findAll(): Promise<ContentStreamResponseDto[]> {
    const streams = await this.contentStreamQueryService.findAll(true);
    return streams.map(toContentStreamResponseDto);
  }
}
