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
  ApiTags,
} from '@nestjs/swagger';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { QueryUserDto } from '../dto/query-user.dto';
import { toUserResponseDto, UserResponseDto } from '../dto/user-response.dto';
import { UserCommandService } from '../services/user-command.service';
import { UserQueryService } from '../services/user-query.service';

@ApiTags('Admin - Users')
@ApiBearerAuth('administrator-bearer')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(AdministratorAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly userQueryService: UserQueryService,
    private readonly userCommandService: UserCommandService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List users with pagination and filtering',
    description:
      'Returns normal-user accounts with profile, verification, onboarding, and lifecycle data. Administrator accounts are stored separately and never appear here.',
  })
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
  @ApiOperation({
    summary: 'Get a single user by ID',
    description:
      'Returns one normal-user account and its profile state. This endpoint cannot resolve administrator identities.',
  })
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
  @ApiOperation({
    summary: 'Soft-delete a user',
    description:
      'Soft-deletes a normal-user account while preserving business history and referential integrity. It does not affect administrator accounts.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async remove(@Param('id') id: string): Promise<void> {
    await this.userCommandService.softDelete(id);
  }
}
