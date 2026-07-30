import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
import { AdminQueryDigestDto } from '../dto/admin-query-digest.dto';
import {
  DigestDetailResponseDto,
  DigestResponseDto,
  toDigestDetailResponseDto,
} from '../dto/digest-response.dto';
import { DigestQueryService } from '../services/digest-query.service';

@ApiTags('Admin - Digests')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/digests')
export class AdminDigestController {
  constructor(private readonly digestQueryService: DigestQueryService) {}

  @Get()
  @ApiOperation({ summary: 'List digests with pagination and filtering (admin only)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(@Query() query: AdminQueryDigestDto): Promise<PaginatedResponseDto<DigestResponseDto>> {
    return this.digestQueryService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single digest with its items (admin only)' })
  @ApiResponse({ status: 200, type: DigestDetailResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async findOne(@Param('id') id: string): Promise<DigestDetailResponseDto> {
    const digest = await this.digestQueryService.findByIdWithItems(id);
    return toDigestDetailResponseDto(digest);
  }
}
