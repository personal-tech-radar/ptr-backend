import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentAdmin } from '../decorators/current-administrator.decorator';
import {
  AdministratorResponseDto,
  CreateAdministratorDto,
  QueryAdministratorsDto,
} from '../dto/administrator.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdministratorAuthGuard } from '../guards/administrator-auth.guard';
import type { CurrentAdministrator } from '../interfaces/current-administrator.interface';
import { AdministratorService } from '../services/administrator.service';

@ApiTags('Admin - Admins')
@ApiBearerAuth('administrator-bearer')
@UseGuards(AdministratorAuthGuard)
@Controller('admin/admins')
export class AdministratorsController {
  constructor(private readonly administrators: AdministratorService) {}

  @Get()
  @ApiOperation({
    summary: 'List administrator accounts',
    description:
      'Returns a paginated administrator directory with optional case-insensitive email filtering. Password hashes and authentication secrets are never returned.',
  })
  @ApiResponse({
    status: 200,
    type: PaginatedResponseDto,
    description: 'Paginated administrator accounts',
  })
  @ApiResponse({ status: 401, description: 'Invalid administrator token' })
  list(@Query() query: QueryAdministratorsDto) {
    return this.administrators.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an administrator account',
    description:
      'Creates an administrator immediately without public registration, email verification, onboarding, or user-domain membership. The creator is recorded for audit purposes.',
  })
  @ApiResponse({
    status: 201,
    type: AdministratorResponseDto,
    description: 'Administrator account created',
  })
  @ApiResponse({ status: 401, description: 'Invalid administrator token' })
  @ApiResponse({ status: 409, description: 'Administrator email already exists' })
  create(@Body() dto: CreateAdministratorDto, @CurrentAdmin() admin: CurrentAdministrator) {
    return this.administrators.create(dto, admin.id);
  }
}
