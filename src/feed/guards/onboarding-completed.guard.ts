import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { CurrentUserPayload } from '../../auth/interfaces/current-user.interface';

// Single consumer today (FeedController) — kept local to src/feed/ rather than promoted to a
// shared auth location. Must run after JwtAuthGuard, which populates request.user.
@Injectable()
export class OnboardingCompletedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: CurrentUserPayload }>();
    const user = request.user;

    if (!user || user.onboardingCompletedAt === null) {
      throw new ForbiddenException({
        message: 'Onboarding must be completed before the personal feed is available',
        errorCode: 'ONBOARDING_NOT_COMPLETED',
      });
    }

    return true;
  }
}
