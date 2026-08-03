import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
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
  @ApiOperation({
    summary: 'Register a new account and send a verification email',
    description:
      'Creates a normal user from email, password, and display name, then sends an email-verification link. The user may log in and complete onboarding before verification, but feeds and scheduled digests remain unavailable until both verification and onboarding are complete.',
  })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'Email already registered' })
  async register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(dto);
  }

  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify an email address using the token sent at registration',
    description:
      'Consumes the verification token and marks the user email as verified. Verification does not complete onboarding automatically.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async verifyEmail(@Query() query: VerifyEmailDto): Promise<MessageResponseDto> {
    await this.authService.verifyEmail(query.token);
    return { message: 'Email verified' };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Authenticates a normal user and returns a user access JWT plus a persisted, rotatable refresh token. Administrator credentials use the separate admin login endpoint.',
  })
  @ApiResponse({ status: 200, type: AuthTokensResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  // LoginDto documents the request body for Swagger; actual credential extraction and
  // validation happens in LocalStrategy via LocalAuthGuard, which sets request.user.
  async login(@Body() _dto: LoginDto, @CurrentUser() user: User): Promise<AuthTokensResponseDto> {
    return this.authService.login(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token and issue a new access token',
    description:
      'Validates and revokes the presented normal-user refresh token, then issues a replacement refresh token and a new user access JWT.',
  })
  @ApiResponse({ status: 200, type: AuthTokensResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out a normal-user refresh session',
    description:
      'Revokes the presented normal-user refresh token. This route does not accept or revoke administrator tokens.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async logout(@Body() dto: RefreshTokenDto): Promise<MessageResponseDto> {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out' };
  }

  @Post('password/forgot')
  @ApiOperation({
    summary: 'Request a password reset email',
    description:
      'Sends a password-reset link when the normal-user account exists while returning the same response for unknown emails to avoid account enumeration.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    await this.authService.forgotPassword(dto);
    return { message: 'If the email exists, a reset link has been sent' };
  }

  @Post('password/reset')
  @ApiOperation({
    summary: 'Reset password using a password reset token',
    description:
      'Consumes a valid normal-user password-reset token, stores the new password hash, and invalidates affected authentication state.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset' };
  }

  @Patch('password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Change the current user password',
    description:
      'Changes the authenticated normal user password after validating the current password. Administrator password changes use the separate admin endpoint.',
  })
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
