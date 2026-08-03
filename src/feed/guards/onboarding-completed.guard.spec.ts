import { ForbiddenException } from '@nestjs/common';
import { OnboardingCompletedGuard } from './onboarding-completed.guard';

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
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks an onboarded user with an unverified email with a stable error code', () => {
    const context = buildContext({
      id: 'user-1',
      email: 'jane@example.com',
      emailVerifiedAt: null,
      onboardingCompletedAt: new Date(),
    });

    try {
      guard.canActivate(context);
      fail('expected ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(response.errorCode).toBe('EMAIL_NOT_VERIFIED');
    }
  });

  it('blocks a verified user with incomplete onboarding before checking verification', () => {
    const context = buildContext({
      id: 'user-1',
      email: 'jane@example.com',
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: null,
    });

    try {
      guard.canActivate(context);
      fail('expected ForbiddenException');
    } catch (error) {
      const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(response.errorCode).toBe('ONBOARDING_NOT_COMPLETED');
    }
  });

  it('blocks a user with onboardingCompletedAt null with a 403 and the correct error shape', () => {
    const context = buildContext({
      id: 'user-1',
      email: 'jane@example.com',
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
