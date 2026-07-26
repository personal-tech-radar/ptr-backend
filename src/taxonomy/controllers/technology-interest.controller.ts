import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { MergeTechnologyInterestDto } from '../dto/merge-technology-interest.dto';
import { QueryTechnologyInterestDto } from '../dto/query-technology-interest.dto';
import {
  TechnologyInterestResponseDto,
  toTechnologyInterestResponseDto,
} from '../dto/technology-interest-response.dto';
import { TechnologyInterestCommandService } from '../services/technology-interest-command.service';
import { TechnologyInterestQueryService } from '../services/technology-interest-query.service';

@ApiTags('Taxonomy')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@Controller('technology-interests')
export class TechnologyInterestController {
  constructor(
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly technologyInterestCommandService: TechnologyInterestCommandService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List/search technologies and interests (paginated typeahead)' })
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

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Merge a duplicate technology/interest into another (admin only)' })
  @ApiResponse({ status: 200, type: TechnologyInterestResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async merge(@Body() dto: MergeTechnologyInterestDto): Promise<TechnologyInterestResponseDto> {
    const entity = await this.technologyInterestCommandService.merge(dto.winnerId, dto.loserId);
    return toTechnologyInterestResponseDto(entity);
  }
}
