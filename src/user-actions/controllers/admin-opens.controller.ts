import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { AdminOpensResponseDto } from '../dto/admin-opens-response.dto';
import { AdminQueryOpensDto } from '../dto/admin-query-opens.dto';
import { PersonalArticleLinkService } from '../services/personal-article-link.service';

@ApiTags('Admin - User Actions')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/opens')
export class AdminOpensController {
  constructor(private readonly personalArticleLinkService: PersonalArticleLinkService) {}

  @Get()
  @ApiOperation({
    summary: 'List personal article opens across all users',
    description:
      'Read-only paginated opening history produced by permanent personal tracking links. Each user/article pair contributes only its first opening signal.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  findAll(
    @Query() query: AdminQueryOpensDto,
  ): Promise<PaginatedResponseDto<AdminOpensResponseDto>> {
    return this.personalArticleLinkService.findAllAdmin(query);
  }
}
