import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
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
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { AdminQueryTechnologyInterestDto } from '../dto/admin-query-technology-interest.dto';
import {
  TechnologyInterestResponseDto,
  toTechnologyInterestResponseDto,
} from '../dto/technology-interest-response.dto';
import { UpdateTechnologyInterestDto } from '../dto/update-technology-interest.dto';
import { TechnologyInterestCommandService } from '../services/technology-interest-command.service';
import { TechnologyInterestQueryService } from '../services/technology-interest-query.service';

@ApiTags('Admin - Taxonomy')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/technology-interests')
export class AdminTechnologyInterestsController {
  constructor(
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly technologyInterestCommandService: TechnologyInterestCommandService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List technologies/interests with pagination and filtering (admin only)',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(
    @Query() query: AdminQueryTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<TechnologyInterestResponseDto>> {
    const result = await this.technologyInterestQueryService.findAllForAdmin(query);
    return {
      data: result.data.map(toTechnologyInterestResponseDto),
      meta: result.meta,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a technology/interest name or aliases (admin only)' })
  @ApiResponse({ status: 200, type: TechnologyInterestResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'Another technology/interest already uses the requested name',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTechnologyInterestDto,
  ): Promise<TechnologyInterestResponseDto> {
    const entity = await this.technologyInterestCommandService.update(id, dto);
    return toTechnologyInterestResponseDto(entity);
  }
}
