import { Body, Controller, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentAdmin } from '../decorators/current-administrator.decorator';
import {
  AdministratorLoginDto,
  AdministratorTokenResponseDto,
  ChangeAdministratorPasswordDto,
} from '../dto/administrator.dto';
import { AdministratorAuthGuard } from '../guards/administrator-auth.guard';
import type { CurrentAdministrator } from '../interfaces/current-administrator.interface';
import { AdministratorService } from '../services/administrator.service';

@ApiTags('Admin - Auth')
@Controller('admin/auth')
export class AdministratorAuthController {
  constructor(private readonly administrators: AdministratorService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in as an administrator',
    description:
      'Authenticates an administrator account and returns a short-lived administrator access token. User credentials and user JWTs are not accepted.',
  })
  @ApiResponse({
    status: 200,
    type: AdministratorTokenResponseDto,
    description: 'Administrator access token and its expiration',
  })
  @ApiResponse({ status: 401, description: 'Invalid administrator credentials' })
  login(@Body() dto: AdministratorLoginDto) {
    return this.administrators.login(dto.email, dto.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdministratorAuthGuard)
  @ApiBearerAuth('administrator-bearer')
  @ApiOperation({
    summary: 'Log out the current administrator session',
    description:
      'Revokes only the presented administrator access token. Other active administrator tokens remain valid.',
  })
  @ApiResponse({ status: 200, description: 'Presented administrator token revoked' })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid, expired, or revoked administrator token',
  })
  async logout(@CurrentAdmin() administrator: CurrentAdministrator) {
    await this.administrators.logout(administrator.jti, administrator.expiresAt);
    return { message: 'Logged out' };
  }

  @Patch('password')
  @UseGuards(AdministratorAuthGuard)
  @ApiBearerAuth('administrator-bearer')
  @ApiOperation({
    summary: 'Change the current administrator password',
    description:
      'Verifies the current password, stores the new password hash, and increments the token version so every previously issued token for this administrator becomes invalid.',
  })
  @ApiResponse({ status: 200, description: 'Password changed and previous tokens invalidated' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or administrator token' })
  async changePassword(
    @CurrentAdmin() administrator: CurrentAdministrator,
    @Body() dto: ChangeAdministratorPasswordDto,
  ) {
    await this.administrators.changePassword(administrator.id, dto);
    return { message: 'Password changed' };
  }
}
