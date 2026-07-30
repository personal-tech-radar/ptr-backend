import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './controllers/auth.controller';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AdminBootstrapService } from './services/admin-bootstrap.service';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { toExpiresIn } from './utils/jwt-expiry.util';
import { getJwtSecret } from './utils/jwt-secret.util';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailVerificationToken, PasswordResetToken, RefreshToken]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: toExpiresIn(process.env.JWT_EXPIRES_IN || '15m') },
      }),
    }),
    UsersModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, AdminBootstrapService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
