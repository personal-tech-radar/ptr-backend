import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getJwtSecret } from '../auth/utils/jwt-secret.util';
import { AdministratorAuthController } from './controllers/administrator-auth.controller';
import { AdministratorsController } from './controllers/administrators.controller';
import { Administrator } from './entities/administrator.entity';
import { AdministratorRevokedToken } from './entities/administrator-revoked-token.entity';
import { AdministratorAuthGuard } from './guards/administrator-auth.guard';
import { AdministratorBootstrapService } from './services/administrator-bootstrap.service';
import { AdministratorService } from './services/administrator.service';
import { AdministratorJwtStrategy } from './strategies/administrator-jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Administrator, AdministratorRevokedToken]),
    PassportModule,
    JwtModule.registerAsync({ useFactory: () => ({ secret: getJwtSecret() }) }),
  ],
  controllers: [AdministratorAuthController, AdministratorsController],
  providers: [
    AdministratorService,
    AdministratorBootstrapService,
    AdministratorJwtStrategy,
    AdministratorAuthGuard,
  ],
  exports: [AdministratorService, AdministratorAuthGuard],
})
export class AdministratorsModule {}
