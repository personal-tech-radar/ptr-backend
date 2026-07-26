import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';
import { AuthTokensResponseDto } from '../dto/auth-tokens-response.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { LoginDto } from '../dto/login.dto';
import { MessageResponseDto } from '../dto/message-response.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RegisterDto } from '../dto/register.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { LocalAuthGuard } from '../guards/local-auth.guard';
import { AuthService } from '../services/auth.service';

@ApiTags('Auth')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new account and send a verification email' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'Email already registered' })
  async register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(dto);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify an email address using the token sent at registration' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async verifyEmail(@Query() query: VerifyEmailDto): Promise<MessageResponseDto> {
    await this.authService.verifyEmail(query.token);
    return { message: 'Email verified' };
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, type: AuthTokensResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  // LoginDto documents the request body for Swagger; actual credential extraction and
  // validation happens in LocalStrategy via LocalAuthGuard, which sets request.user.
  async login(@Body() _dto: LoginDto, @CurrentUser() user: User): Promise<AuthTokensResponseDto> {
    return this.authService.login(user);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new access token' })
  @ApiResponse({ status: 200, type: AuthTokensResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async logout(@Body() dto: RefreshTokenDto): Promise<MessageResponseDto> {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out' };
  }

  @Post('password/forgot')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    await this.authService.forgotPassword(dto);
    return { message: 'If the email exists, a reset link has been sent' };
  }

  @Post('password/reset')
  @ApiOperation({ summary: 'Reset password using a password reset token' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset' };
  }

  @Patch('password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change password while logged in' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    await this.authService.changePassword(user.id, dto);
    return { message: 'Password changed' };
  }
}
