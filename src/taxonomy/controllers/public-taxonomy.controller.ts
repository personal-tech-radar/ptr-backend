import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QueryTechnologyInterestDto } from '../dto/query-technology-interest.dto';
import {
  TechnologyInterestResponseDto,
  toTechnologyInterestResponseDto,
} from '../dto/technology-interest-response.dto';
import {
  ContentStreamResponseDto,
  toContentStreamResponseDto,
} from '../dto/content-stream-response.dto';
import { ContentStreamQueryService } from '../services/content-stream-query.service';
import { TechnologyInterestQueryService } from '../services/technology-interest-query.service';

@ApiTags('Public Content')
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(ApiKeyGuard)
@Controller('public')
export class PublicTaxonomyController {
  constructor(
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly contentStreamQueryService: ContentStreamQueryService,
  ) {}

  @Get('technology-interests')
  @ApiOperation({
    summary: 'Search the public technology and interest catalog',
    description:
      'API-key-only, read-only paginated catalog for pre-registration experiences. Results contain active global technologies and interests, including their kind, canonical name, and aliases. This endpoint never creates or selects taxonomy entries; use the authenticated onboarding endpoint for that.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async findTechnologyInterests(
    @Query() query: QueryTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<TechnologyInterestResponseDto>> {
    const result = await this.technologyInterestQueryService.findAll(query);
    return {
      data: result.data.map(toTechnologyInterestResponseDto),
      meta: result.meta,
    };
  }

  @Get('content-streams')
  @ApiOperation({
    summary: 'List public content streams',
    description:
      'API-key-only, read-only list of enabled system-defined content streams available to the pre-registration preview. Custom stream creation and stream administration are not exposed here.',
  })
  @ApiResponse({ status: 200, type: [ContentStreamResponseDto] })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async findContentStreams(): Promise<ContentStreamResponseDto[]> {
    const streams = await this.contentStreamQueryService.findAll(true);
    return streams.map(toContentStreamResponseDto);
  }
}
