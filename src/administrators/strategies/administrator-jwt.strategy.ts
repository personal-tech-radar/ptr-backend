import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from '../../auth/utils/jwt-secret.util';
import { CurrentAdministrator } from '../interfaces/current-administrator.interface';
import {
  ADMIN_JWT_AUDIENCE,
  ADMIN_JWT_SUBJECT_TYPE,
  AdministratorService,
} from '../services/administrator.service';

interface AdministratorJwtPayload {
  sub: string;
  email: string;
  subjectType: string;
  tokenVersion: number;
  jti: string;
  exp: number;
}

@Injectable()
export class AdministratorJwtStrategy extends PassportStrategy(Strategy, 'administrator-jwt') {
  constructor(private readonly administrators: AdministratorService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
      audience: ADMIN_JWT_AUDIENCE,
      ignoreExpiration: false,
    });
  }

  async validate(payload: AdministratorJwtPayload): Promise<CurrentAdministrator> {
    if (payload.subjectType !== ADMIN_JWT_SUBJECT_TYPE) throw new UnauthorizedException();
    const administrator = await this.administrators.findById(payload.sub);
    if (
      !administrator ||
      administrator.tokenVersion !== payload.tokenVersion ||
      (await this.administrators.isRevoked(payload.jti))
    ) {
      throw new UnauthorizedException('Administrator token has been revoked');
    }
    return {
      id: administrator.id,
      email: administrator.email,
      tokenVersion: administrator.tokenVersion,
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
    };
  }
}
