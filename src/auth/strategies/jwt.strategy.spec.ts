import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  const mockUserQueryService = {
    findById: jest.fn(),
  };

  // JwtStrategy's constructor reads JWT_SECRET via getJwtSecret(), which throws if unset — a
  // placeholder value is needed regardless of whether the environment defines a real one.
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-dummy-jwt-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(mockUserQueryService as any);
  });

  it('returns the current user payload for an active, existing user', async () => {
    const onboardingCompletedAt = new Date('2026-01-01T00:00:00Z');
    const emailVerifiedAt = new Date('2025-12-31T00:00:00Z');
    mockUserQueryService.findById.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      emailVerifiedAt,
      onboardingCompletedAt,
    });

    const result = await strategy.validate({
      sub: 'user-1',
      email: 'jane@example.com',
      subjectType: 'user',
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'jane@example.com',
      subjectType: 'user',
      emailVerifiedAt,
      onboardingCompletedAt,
    });
  });

  // UserQueryService.findById relies on TypeORM's default soft-delete exclusion and throws
  // NotFoundException for a deleted user — this proves that surfaces as Unauthorized here.
  it('throws UnauthorizedException when the user is missing or soft-deleted', async () => {
    mockUserQueryService.findById.mockRejectedValue(new Error('not found'));

    await expect(
      strategy.validate({ sub: 'deleted-user', email: 'gone@example.com', subjectType: 'user' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
