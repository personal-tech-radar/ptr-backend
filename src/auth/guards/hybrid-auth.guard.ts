import { ExecutionContext, Injectable, InternalServerErrorException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { UserRole } from '../../users/entities/user.entity';

// Accepts either a machine client via X-API-KEY (reusing ApiKeyGuard's validation logic) or a
// human user via a JWT Bearer token — lets the same route serve both caller types without
// duplicating guard chains. API key wins when both are present.
@Injectable()
export class HybridAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];

    if (providedKey) {
      const validKey = process.env.API_KEY;
      if (!validKey) {
        throw new InternalServerErrorException('API key is not configured on the server.');
      }

      if (providedKey === validKey) {
        (request as Request & { user: unknown }).user = {
          id: 'api-key-client',
          email: 'api-key-client',
          role: UserRole.ADMIN,
          onboardingCompletedAt: null,
        };
        return true;
      }
      // Falls through to JWT auth on a wrong API key rather than failing outright, in case a
      // stray/incorrect X-API-KEY header was sent alongside a valid Bearer token.
    }

    return super.canActivate(context) as boolean | Promise<boolean>;
  }
}
