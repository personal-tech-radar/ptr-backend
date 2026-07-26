import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserQueryService } from '../../users/services/user-query.service';
import { CurrentUserPayload } from '../interfaces/current-user.interface';
import { getJwtSecret } from '../utils/jwt-secret.util';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly userQueryService: UserQueryService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  // UserQueryService.findById relies on TypeORM's default soft-delete exclusion (deletedAt IS
  // NULL) and throws NotFoundException for a deleted or missing user — mapped to Unauthorized
  // here so a soft-deleted user's still-valid access token is rejected on every request.
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    try {
      const user = await this.userQueryService.findById(payload.sub);
      return { id: user.id, email: user.email, role: user.role };
    } catch {
      throw new UnauthorizedException('User not found or has been deleted');
    }
  }
}
