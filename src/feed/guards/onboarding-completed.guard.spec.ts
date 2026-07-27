import { ForbiddenException } from '@nestjs/common';
import { OnboardingCompletedGuard } from './onboarding-completed.guard';
import { UserRole } from '../../users/entities/user.entity';

describe('OnboardingCompletedGuard', () => {
  let guard: OnboardingCompletedGuard;

  beforeEach(() => {
    guard = new OnboardingCompletedGuard();
  });

  const buildContext = (user?: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  it('allows a user with onboardingCompletedAt set', () => {
    const context = buildContext({
      id: 'user-1',
      email: 'jane@example.com',
      role: UserRole.USER,
      onboardingCompletedAt: new Date(),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks a user with onboardingCompletedAt null with a 403 and the correct error shape', () => {
    const context = buildContext({
      id: 'user-1',
      email: 'jane@example.com',
      role: UserRole.USER,
      onboardingCompletedAt: null,
    });

    try {
      guard.canActivate(context);
      fail('expected ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(response.errorCode).toBe('ONBOARDING_NOT_COMPLETED');
    }
  });

  it('blocks when request.user is missing entirely', () => {
    const context = buildContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
