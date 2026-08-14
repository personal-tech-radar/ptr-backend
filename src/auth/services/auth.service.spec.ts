import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { UserCommandService } from '../../users/services/user-command.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { MailService } from '../../mail/services/mail.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockEmailVerificationTokenRepo = {
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ id: 'evt-1', ...data })),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const mockPasswordResetTokenRepo = {
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ id: 'prt-1', ...data })),
    findOne: jest.fn(),
  };
  const mockRefreshTokenRepo = {
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ id: 'rt-1', ...data })),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const mockUserCommandService = {
    create: jest.fn(),
    markEmailVerified: jest.fn(),
    updatePasswordHash: jest.fn(),
  };
  const mockUserQueryService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
  };
  const mockJwtService = {
    sign: jest.fn(() => 'signed-access-token'),
  };
  const mockMailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'jane@example.com',
    displayName: 'Jane',
    passwordHash: '',
  };

  // AuthService.issueTokens reads JWT_SECRET via getJwtSecret(), which throws if unset — a
  // placeholder value is needed regardless of whether the environment defines a real one.
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('correct-password', 10);
    process.env.JWT_SECRET = 'test-dummy-jwt-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(EmailVerificationToken),
          useValue: mockEmailVerificationTokenRepo,
        },
        { provide: getRepositoryToken(PasswordResetToken), useValue: mockPasswordResetTokenRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepo },
        { provide: UserCommandService, useValue: mockUserCommandService },
        { provide: UserQueryService, useValue: mockUserQueryService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates a user, persists a verification token, and sends a best-effort email', async () => {
      mockUserCommandService.create.mockResolvedValue(mockUser);

      const result = await service.register({
        email: mockUser.email,
        password: 'correct-password',
        displayName: mockUser.displayName,
      });

      expect(mockEmailVerificationTokenRepo.save).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.displayName,
        expect.any(String),
      );
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.accessToken).toBe('signed-access-token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(mockUserCommandService.create).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: null }),
      );
    });

    it('registration succeeds even when sending the verification email fails', async () => {
      mockUserCommandService.create.mockResolvedValue(mockUser);
      mockMailService.sendVerificationEmail.mockRejectedValue(new Error('resend down'));

      await expect(
        service.register({
          email: mockUser.email,
          password: 'correct-password',
          displayName: mockUser.displayName,
        }),
      ).resolves.toMatchObject({ user: { email: mockUser.email } });
    });
  });

  describe('verifyEmail', () => {
    it('marks the email verified when the token is valid and unexpired', async () => {
      mockEmailVerificationTokenRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        userId: mockUser.id,
        consumedAt: null,
      });

      await service.verifyEmail('raw-token');

      expect(mockEmailVerificationTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ consumedAt: expect.any(Date) }),
      );
      expect(mockUserCommandService.markEmailVerified).toHaveBeenCalledWith(mockUser.id);
    });

    it('throws BadRequestException for an unknown or expired token', async () => {
      mockEmailVerificationTokenRepo.findOne.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(BadRequestException);
      expect(mockUserCommandService.markEmailVerified).not.toHaveBeenCalled();
    });
  });

  describe('resendVerificationEmail', () => {
    it('supersedes active tokens and sends a replacement without revealing account state', async () => {
      mockUserQueryService.findByEmail.mockResolvedValue({
        ...mockUser,
        emailVerifiedAt: null,
      });

      await service.resendVerificationEmail(' JANE@EXAMPLE.COM ');

      expect(mockUserQueryService.findByEmail).toHaveBeenCalledWith('jane@example.com');
      expect(mockEmailVerificationTokenRepo.update).toHaveBeenCalledWith(
        { userId: mockUser.id, consumedAt: expect.anything() },
        { consumedAt: expect.any(Date) },
      );
      expect(mockEmailVerificationTokenRepo.save).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.displayName,
        expect.any(String),
      );
    });

    it.each([
      ['unknown', null],
      ['already verified', { ...mockUser, emailVerifiedAt: new Date() }],
    ])('does not reveal an %s account', async (_case, user) => {
      mockUserQueryService.findByEmail.mockResolvedValue(user);

      await expect(service.resendVerificationEmail('jane@example.com')).resolves.toBeUndefined();
      expect(mockEmailVerificationTokenRepo.update).not.toHaveBeenCalled();
      expect(mockEmailVerificationTokenRepo.save).not.toHaveBeenCalled();
      expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    it('returns the user when the password matches', async () => {
      mockUserQueryService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.validateUser(mockUser.email, 'correct-password');
      expect(result).toBe(mockUser);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      mockUserQueryService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.validateUser(mockUser.email, 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when no user exists for the email', async () => {
      mockUserQueryService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('missing@example.com', 'x')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('login', () => {
    it('issues an access token and persists a hashed refresh token', async () => {
      const result = await service.login(mockUser as any);

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(mockRefreshTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: mockUser.id }),
      );
      // The raw refresh token is never the same as its persisted hash.
      const savedArg = mockRefreshTokenRepo.save.mock.calls[0][0];
      expect(savedArg.tokenHash).not.toBe(result.refreshToken);
    });

    it('issues tokens before email verification', async () => {
      await expect(service.login({ ...mockUser, emailVerifiedAt: null } as any)).resolves.toEqual(
        expect.objectContaining({ accessToken: 'signed-access-token' }),
      );
    });
  });

  describe('refresh', () => {
    it('rotates the token: revokes the old one and issues a new pair', async () => {
      const record = {
        id: 'rt-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      };
      mockRefreshTokenRepo.findOne.mockResolvedValue(record);
      mockUserQueryService.findById.mockResolvedValue(mockUser);

      const result = await service.refresh('raw-refresh-token');

      expect(record.revokedAt).toBeInstanceOf(Date);
      expect(mockRefreshTokenRepo.save).toHaveBeenCalledWith(record);
      expect(result.accessToken).toBe('signed-access-token');
    });

    it('throws UnauthorizedException for an unknown, expired, or revoked token', async () => {
      mockRefreshTokenRepo.findOne.mockResolvedValue(null);

      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the owning user is gone or soft-deleted', async () => {
      mockRefreshTokenRepo.findOne.mockResolvedValue({
        id: 'rt-1',
        userId: mockUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      mockUserQueryService.findById.mockRejectedValue(new Error('not found'));

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the matching refresh token', async () => {
      const record = { id: 'rt-1', userId: mockUser.id, revokedAt: null };
      mockRefreshTokenRepo.findOne.mockResolvedValue(record);

      await service.logout('raw-refresh-token');

      expect(record.revokedAt).toBeInstanceOf(Date);
      expect(mockRefreshTokenRepo.save).toHaveBeenCalledWith(record);
    });

    it('is idempotent when the token is unknown or already revoked', async () => {
      mockRefreshTokenRepo.findOne.mockResolvedValue(null);

      await expect(service.logout('unknown-token')).resolves.toBeUndefined();
      expect(mockRefreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('does nothing detectable when the email is unknown', async () => {
      mockUserQueryService.findByEmail.mockResolvedValue(null);

      await service.forgotPassword({ email: 'missing@example.com' });

      expect(mockPasswordResetTokenRepo.save).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates a reset token and sends a best-effort email when the user exists', async () => {
      mockUserQueryService.findByEmail.mockResolvedValue(mockUser);

      await service.forgotPassword({ email: mockUser.email });

      expect(mockPasswordResetTokenRepo.save).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.displayName,
        expect.any(String),
      );
    });
  });

  describe('resetPassword', () => {
    it('consumes the token, updates the password, and revokes active refresh tokens', async () => {
      const record = { id: 'prt-1', userId: mockUser.id, consumedAt: null };
      mockPasswordResetTokenRepo.findOne.mockResolvedValue(record);

      await service.resetPassword({ token: 'raw-token', newPassword: 'new-password' });

      expect(record.consumedAt).toBeInstanceOf(Date);
      expect(mockUserCommandService.updatePasswordHash).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
      );
      expect(mockRefreshTokenRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: mockUser.id }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('throws BadRequestException for an unknown or expired token', async () => {
      mockPasswordResetTokenRepo.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bad-token', newPassword: 'new-password' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changePassword', () => {
    it('updates the password when the current password matches', async () => {
      mockUserQueryService.findById.mockResolvedValue(mockUser);

      await service.changePassword(mockUser.id, {
        currentPassword: 'correct-password',
        newPassword: 'new-password',
      });

      expect(mockUserCommandService.updatePasswordHash).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
      );
    });

    it('throws UnauthorizedException when the current password does not match', async () => {
      mockUserQueryService.findById.mockResolvedValue(mockUser);

      await expect(
        service.changePassword(mockUser.id, {
          currentPassword: 'wrong-password',
          newPassword: 'new-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockUserCommandService.updatePasswordHash).not.toHaveBeenCalled();
    });
  });
});
