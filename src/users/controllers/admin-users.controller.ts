import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { QueryUserDto } from '../dto/query-user.dto';
import { toUserResponseDto, UserResponseDto } from '../dto/user-response.dto';
import { UserRole } from '../entities/user.entity';
import { UserCommandService } from '../services/user-command.service';
import { UserQueryService } from '../services/user-query.service';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly userQueryService: UserQueryService,
    private readonly userCommandService: UserCommandService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users with pagination and filtering (admin only)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async findAll(@Query() query: QueryUserDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const result = await this.userQueryService.findAll(query);
    return {
      data: result.data.map(toUserResponseDto),
      meta: result.meta,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user by ID (admin only)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    const entity = await this.userQueryService.findById(id);
    return toUserResponseDto(entity);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user (admin only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async remove(@Param('id') id: string): Promise<void> {
    await this.userCommandService.softDelete(id);
  }
}
