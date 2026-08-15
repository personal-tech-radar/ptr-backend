import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { QueryTechnologyInterestDto } from '../dto/query-technology-interest.dto';
import {
  TechnologyInterestResponseDto,
  toTechnologyInterestResponseDto,
} from '../dto/technology-interest-response.dto';
import { TechnologyInterestQueryService } from '../services/technology-interest-query.service';

@ApiTags('Taxonomy')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@Controller('technology-interests')
export class TechnologyInterestController {
  constructor(private readonly technologyInterestQueryService: TechnologyInterestQueryService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search the technology and interest catalog',
    description:
      'Authenticated paginated typeahead over existing global taxonomy entries. Use the onboarding/update endpoint to select results or submit a new name for create-or-reuse processing.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async findAll(
    @Query() query: QueryTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<TechnologyInterestResponseDto>> {
    const result = await this.technologyInterestQueryService.findAll(query);
    return {
      data: result.data.map(toTechnologyInterestResponseDto),
      meta: result.meta,
    };
  }
}
