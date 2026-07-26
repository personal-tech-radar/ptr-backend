import { InternalServerErrorException } from '@nestjs/common';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { UserRole } from '../../users/entities/user.entity';

describe('HybridAuthGuard', () => {
  let guard: HybridAuthGuard;
  let superCanActivateSpy: jest.SpyInstance;
  const originalApiKey = process.env.API_KEY;

  const buildContext = (headers: Record<string, string> = {}) => {
    const request: Record<string, unknown> = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      request,
    };
  };

  beforeEach(() => {
    guard = new HybridAuthGuard();
    // HybridAuthGuard extends AuthGuard('jwt'); the JWT path itself is exercised by
    // JwtStrategy's own tests, so here we only need to confirm it's delegated to.
    const jwtGuardProto = Object.getPrototypeOf(HybridAuthGuard.prototype);
    superCanActivateSpy = jest.spyOn(jwtGuardProto, 'canActivate').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.API_KEY = originalApiKey;
  });

  it('authenticates via a valid X-API-KEY and sets a synthetic admin user', () => {
    process.env.API_KEY = 'valid-key';
    const { switchToHttp, request } = buildContext({ 'x-api-key': 'valid-key' });
    const context = { switchToHttp } as any;

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: 'api-key-client',
      email: 'api-key-client',
      role: UserRole.ADMIN,
    });
    expect(superCanActivateSpy).not.toHaveBeenCalled();
  });

  it('throws InternalServerErrorException when API_KEY is not configured on the server', () => {
    delete process.env.API_KEY;
    const { switchToHttp } = buildContext({ 'x-api-key': 'anything' });
    const context = { switchToHttp } as any;

    expect(() => guard.canActivate(context)).toThrow(InternalServerErrorException);
  });

  it('falls through to JWT auth when no X-API-KEY header is present', () => {
    const { switchToHttp } = buildContext();
    const context = { switchToHttp } as any;

    const result = guard.canActivate(context);

    expect(superCanActivateSpy).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
  });
});
