import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { MailService } from '../../mail/services/mail.service';
import { toUserResponseDto } from '../../users/dto/user-response.dto';
import { User } from '../../users/entities/user.entity';
import { UserCommandService } from '../../users/services/user-command.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { AuthTokensResponseDto } from '../dto/auth-tokens-response.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { RegisterDto } from '../dto/register.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { toExpiresIn } from '../utils/jwt-expiry.util';
import { getJwtSecret } from '../utils/jwt-secret.util';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new LoggingService(AuthService.name);

  constructor(
    @InjectRepository(EmailVerificationToken)
    private readonly emailVerificationTokenRepo: Repository<EmailVerificationToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly userCommandService: UserCommandService,
    private readonly userQueryService: UserQueryService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.userQueryService.findByEmail(email.trim().toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.userCommandService.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      timezone: dto.timezone,
    });

    const rawToken = this.generateRawToken();
    const verificationToken = this.emailVerificationTokenRepo.create({
      userId: user.id,
      tokenHash: this.hashToken(rawToken),
      expiresAt: this.hoursFromNow(this.getEnvHours('EMAIL_VERIFICATION_TOKEN_TTL_HOURS', 48)),
    });
    await this.emailVerificationTokenRepo.save(verificationToken);

    // Best-effort — registration must succeed even if the email provider is unreachable or
    // misconfigured (matches MailService's existing non-fatal-failure pattern for digest sends).
    try {
      await this.mailService.sendVerificationEmail(user.email, user.displayName, rawToken);
    } catch (err) {
      this.logger.error('Failed to send verification email', err as Error, { userId: user.id });
    }

    this.logger.info('User registered', { userId: user.id });
    return toUserResponseDto(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const record = await this.emailVerificationTokenRepo.findOne({
      where: { tokenHash, consumedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    record.consumedAt = new Date();
    await this.emailVerificationTokenRepo.save(record);
    await this.userCommandService.markEmailVerified(record.userId);

    this.logger.info('Email verified', { userId: record.userId });
  }

  async login(user: User): Promise<AuthTokensResponseDto> {
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponseDto> {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.refreshTokenRepo.findOne({
      where: { tokenHash, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotation: the presented token is invalidated regardless of what happens next, so a stolen
    // refresh token can be used at most once before both parties notice.
    record.revokedAt = new Date();
    await this.refreshTokenRepo.save(record);

    let user: User;
    try {
      user = await this.userQueryService.findById(record.userId);
    } catch {
      throw new UnauthorizedException('User not found or has been deleted');
    }

    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.refreshTokenRepo.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });

    if (!record) {
      // Idempotent: an already-revoked/unknown token still results in "logged out".
      return;
    }

    record.revokedAt = new Date();
    await this.refreshTokenRepo.save(record);
    this.logger.info('User logged out', { userId: record.userId });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userQueryService.findByEmail(email);

    if (!user) {
      // Do not reveal whether an account exists for this email.
      this.logger.info('Password reset requested for unknown email');
      return;
    }

    const rawToken = this.generateRawToken();
    const resetToken = this.passwordResetTokenRepo.create({
      userId: user.id,
      tokenHash: this.hashToken(rawToken),
      expiresAt: this.hoursFromNow(this.getEnvHours('PASSWORD_RESET_TOKEN_TTL_HOURS', 2)),
    });
    await this.passwordResetTokenRepo.save(resetToken);

    try {
      await this.mailService.sendPasswordResetEmail(user.email, user.displayName, rawToken);
    } catch (err) {
      this.logger.error('Failed to send password reset email', err as Error, {
        userId: user.id,
      });
    }

    this.logger.info('Password reset requested', { userId: user.id });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.passwordResetTokenRepo.findOne({
      where: { tokenHash, consumedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    record.consumedAt = new Date();
    await this.passwordResetTokenRepo.save(record);

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.userCommandService.updatePasswordHash(record.userId, passwordHash);

    // A password reset invalidates every outstanding refresh token — the whole point of a reset
    // is to lock out anyone who had persistent access via the old credentials.
    await this.refreshTokenRepo.update(
      { userId: record.userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    this.logger.info('Password reset completed', { userId: record.userId });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userQueryService.findById(userId);

    const passwordMatches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.userCommandService.updatePasswordHash(userId, passwordHash);

    this.logger.info('Password changed', { userId });
  }

  private async issueTokens(user: User): Promise<AuthTokensResponseDto> {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: getJwtSecret(),
        expiresIn: toExpiresIn(process.env.JWT_EXPIRES_IN || '15m'),
      },
    );

    const rawRefreshToken = this.generateRawToken();
    const refreshTokenEntity = this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash: this.hashToken(rawRefreshToken),
      expiresAt: this.hoursFromNow(
        this.parseDurationToHours(process.env.JWT_REFRESH_EXPIRES_IN || '30d'),
      ),
    });
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: toUserResponseDto(user),
    };
  }

  private generateRawToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hoursFromNow(hours: number): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private getEnvHours(envVar: string, fallback: number): number {
    const raw = process.env[envVar];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // Parses simple duration strings like "15m", "2h", "30d" into hours. Falls back to 720h (30d)
  // for anything unrecognized rather than throwing — JWT_REFRESH_EXPIRES_IN misconfiguration
  // should never break login/refresh.
  private parseDurationToHours(duration: string): number {
    const match = /^(\d+)\s*(s|m|h|d)$/.exec(duration.trim());
    if (!match) return 720;

    const value = Number(match[1]);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value / 3600;
      case 'm':
        return value / 60;
      case 'h':
        return value;
      case 'd':
        return value * 24;
      default:
        return 720;
    }
  }
}
