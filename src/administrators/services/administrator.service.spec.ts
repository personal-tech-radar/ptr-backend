/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdministratorService } from './administrator.service';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('../../auth/utils/password-hash.util', () => ({
  hashPassword: jest.fn(async (value: string) => `hashed:${value}`),
}));

describe('AdministratorService', () => {
  const repository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      id: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...value,
    })),
    createQueryBuilder: jest.fn(),
  };
  const revokedTokens = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const jwt = { sign: jest.fn(() => 'administrator-token') };
  let service: AdministratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdministratorService(
      repository as never,
      revokedTokens as never,
      jwt as unknown as JwtService,
    );
  });

  it('creates an administrator without exposing the password hash', async () => {
    repository.findOne.mockResolvedValue(null);
    const result = await service.create(
      { email: 'Next@Example.com', password: 'a-secure-password' },
      'creator-1',
    );
    expect(result).toMatchObject({ email: 'next@example.com', createdByAdminId: 'creator-1' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate administrator email', async () => {
    repository.findOne.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create({ email: 'admin@example.com', password: 'a-secure-password' }, null),
    ).rejects.toThrow(ConflictException);
  });

  it('issues a short-lived administrator-audience token after login', async () => {
    const bcrypt = jest.requireMock('bcrypt');
    bcrypt.compare.mockResolvedValue(true);
    repository.findOne.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      passwordHash: 'hash',
      tokenVersion: 3,
      lastLoginAt: null,
    });
    const result = await service.login('admin@example.com', 'password');
    expect(result.accessToken).toBe('administrator-token');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ subjectType: 'administrator', tokenVersion: 3 }),
      expect.objectContaining({ audience: 'ptr-administrator', expiresIn: '15m' }),
    );
  });

  it('revokes only the presented administrator token on logout', async () => {
    revokedTokens.findOne.mockResolvedValue(null);
    await service.logout('presented-jti', new Date('2026-08-03'));
    expect(revokedTokens.save).toHaveBeenCalledWith(
      expect.objectContaining({ jti: 'presented-jti' }),
    );
  });

  it('changes the password and increments tokenVersion', async () => {
    const bcrypt = jest.requireMock('bcrypt');
    bcrypt.compare.mockResolvedValue(true);
    const administrator = { id: 'admin-1', passwordHash: 'old', tokenVersion: 2 };
    repository.findOne.mockResolvedValue(administrator);
    await service.changePassword('admin-1', {
      currentPassword: 'old-password',
      newPassword: 'new-secure-password',
    });
    expect(administrator.tokenVersion).toBe(3);
    expect(repository.save).toHaveBeenCalledWith(administrator);
  });

  it('rejects an invalid current password', async () => {
    const bcrypt = jest.requireMock('bcrypt');
    bcrypt.compare.mockResolvedValue(false);
    repository.findOne.mockResolvedValue({ passwordHash: 'old' });
    await expect(
      service.changePassword('admin-1', {
        currentPassword: 'wrong-password',
        newPassword: 'new-secure-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
