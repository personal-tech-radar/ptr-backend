import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/entities/user.entity';

describe('RolesGuard', () => {
  let guard: RolesGuard;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const buildContext = (user?: { role: UserRole }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(mockReflector as unknown as Reflector);
  });

  it('allows access when the route requires no roles', () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(buildContext({ role: UserRole.USER }))).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(buildContext({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('denies access when the user lacks the required role', () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(buildContext({ role: UserRole.USER }))).toBe(false);
  });

  it('denies access when the request has no authenticated user', () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });
});
