import { UnauthorizedException } from '@nestjs/common';
import { AdministratorJwtStrategy } from './administrator-jwt.strategy';

describe('AdministratorJwtStrategy', () => {
  const administrators = { findById: jest.fn(), isRevoked: jest.fn() };
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });
  afterAll(() => {
    process.env.JWT_SECRET = previousSecret;
  });
  beforeEach(() => jest.clearAllMocks());

  it('accepts a current administrator token', async () => {
    administrators.findById.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      tokenVersion: 2,
    });
    administrators.isRevoked.mockResolvedValue(false);
    const strategy = new AdministratorJwtStrategy(administrators as never);
    await expect(
      strategy.validate({
        sub: 'admin-1',
        email: 'admin@example.com',
        subjectType: 'administrator',
        tokenVersion: 2,
        jti: 'jti-1',
        exp: 2_000_000_000,
      }),
    ).resolves.toMatchObject({ id: 'admin-1', jti: 'jti-1' });
  });

  it('rejects a user subject and an obsolete token version', async () => {
    const strategy = new AdministratorJwtStrategy(administrators as never);
    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'user@example.com',
        subjectType: 'user',
        tokenVersion: 0,
        jti: 'jti-user',
        exp: 2_000_000_000,
      }),
    ).rejects.toThrow(UnauthorizedException);

    administrators.findById.mockResolvedValue({ id: 'admin-1', tokenVersion: 3 });
    administrators.isRevoked.mockResolvedValue(false);
    await expect(
      strategy.validate({
        sub: 'admin-1',
        email: 'admin@example.com',
        subjectType: 'administrator',
        tokenVersion: 2,
        jti: 'old-jti',
        exp: 2_000_000_000,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
