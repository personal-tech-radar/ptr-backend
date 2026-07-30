import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserCommandService } from './user-command.service';
import { User, UserLevel, UserRole } from '../entities/user.entity';
import { FeedCacheInvalidationService } from '../../feed/services/feed-cache-invalidation.service';

describe('UserCommandService', () => {
  let service: UserCommandService;

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ id: 'generated-id', role: UserRole.USER, ...data })),
    softDelete: jest.fn(),
    restore: jest.fn(),
  };

  const mockFeedCacheInvalidationService = {
    invalidateForUser: jest.fn(),
  };

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserCommandService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FeedCacheInvalidationService, useValue: mockFeedCacheInvalidationService },
      ],
    }).compile();

    service = module.get<UserCommandService>(UserCommandService);
  });

  describe('create', () => {
    const input = {
      email: 'jane@example.com',
      passwordHash: 'hashed',
      displayName: 'Jane',
      timezone: 'Europe/Berlin',
    };

    it('creates a user when the email is not already taken', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const result = await service.create(input);

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { email: input.email } });
      expect(result.email).toBe(input.email);
    });

    it('throws ConflictException when the email already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'existing', email: input.email });

      await expect(service.create(input)).rejects.toThrow(ConflictException);
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('defaults role/emailVerifiedAt/onboardingCompletedAt when omitted (AuthService.register call shape)', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const result = await service.create(input);

      expect(result.role).toBe(UserRole.USER);
      expect(result.emailVerifiedAt).toBeNull();
      expect(result.onboardingCompletedAt).toBeNull();
    });

    it('honors explicitly provided role/emailVerifiedAt/onboardingCompletedAt', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const verifiedAt = new Date();
      const onboardedAt = new Date();

      const result = await service.create({
        ...input,
        role: UserRole.ADMIN,
        emailVerifiedAt: verifiedAt,
        onboardingCompletedAt: onboardedAt,
      });

      expect(result.role).toBe(UserRole.ADMIN);
      expect(result.emailVerifiedAt).toBe(verifiedAt);
      expect(result.onboardingCompletedAt).toBe(onboardedAt);
    });
  });

  describe('resurrectAsAdmin', () => {
    it('restores the row, sets role to admin, and does not touch passwordHash', async () => {
      mockUserRepo.restore.mockResolvedValue({ affected: 1 });
      mockUserRepo.findOne.mockResolvedValue({
        id: validId,
        role: UserRole.USER,
        passwordHash: 'existing-hash',
        emailVerifiedAt: null,
        onboardingCompletedAt: null,
        deletedAt: null,
      });

      const result = await service.resurrectAsAdmin(validId);

      expect(mockUserRepo.restore).toHaveBeenCalledWith(validId);
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({
        where: { id: validId },
        withDeleted: true,
      });
      expect(result.role).toBe(UserRole.ADMIN);
      expect(result.passwordHash).toBe('existing-hash');
      expect(result.emailVerifiedAt).toBeInstanceOf(Date);
      expect(result.onboardingCompletedAt).toBeInstanceOf(Date);
    });

    it('does not overwrite emailVerifiedAt/onboardingCompletedAt when already set', async () => {
      const existingVerifiedAt = new Date('2020-01-01');
      const existingOnboardedAt = new Date('2020-01-02');
      mockUserRepo.restore.mockResolvedValue({ affected: 1 });
      mockUserRepo.findOne.mockResolvedValue({
        id: validId,
        role: UserRole.USER,
        passwordHash: 'existing-hash',
        emailVerifiedAt: existingVerifiedAt,
        onboardingCompletedAt: existingOnboardedAt,
        deletedAt: null,
      });

      const result = await service.resurrectAsAdmin(validId);

      expect(result.emailVerifiedAt).toBe(existingVerifiedAt);
      expect(result.onboardingCompletedAt).toBe(existingOnboardedAt);
    });

    it('throws NotFoundException when the row cannot be found after restore', async () => {
      mockUserRepo.restore.mockResolvedValue({ affected: 0 });
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.resurrectAsAdmin(validId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('throws BadRequestException for invalid ID format', async () => {
      await expect(
        service.updateProfile('not-a-uuid', { displayName: 'New Name' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.updateProfile(validId, { displayName: 'New Name' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates only the provided fields', async () => {
      const existing = {
        id: validId,
        displayName: 'Old Name',
        timezone: 'UTC',
        githubUrl: null,
      };
      mockUserRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateProfile(validId, { displayName: 'New Name' });

      expect(result.displayName).toBe('New Name');
      expect(result.timezone).toBe('UTC');
    });

    it('updates the level', async () => {
      const existing = {
        id: validId,
        displayName: 'Old Name',
        timezone: 'UTC',
        githubUrl: null,
        level: UserLevel.JUNIOR,
      };
      mockUserRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateProfile(validId, { level: UserLevel.SENIOR });

      expect(result.level).toBe('senior');
      expect(result.displayName).toBe('Old Name');
    });

    it('invalidates the feed cache after any profile update', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: validId, displayName: 'Old Name' });

      await service.updateProfile(validId, { displayName: 'New Name' });

      expect(mockFeedCacheInvalidationService.invalidateForUser).toHaveBeenCalledWith(validId);
    });
  });

  describe('softDelete', () => {
    it('throws BadRequestException for invalid ID format', async () => {
      await expect(service.softDelete('not-a-uuid')).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.softDelete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when nothing was affected', async () => {
      mockUserRepo.softDelete.mockResolvedValue({ affected: 0 });

      await expect(service.softDelete(validId)).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes the user', async () => {
      mockUserRepo.softDelete.mockResolvedValue({ affected: 1 });

      await expect(service.softDelete(validId)).resolves.toBeUndefined();
      expect(mockUserRepo.softDelete).toHaveBeenCalledWith(validId);
    });
  });

  describe('updatePasswordHash', () => {
    it('updates the password hash', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: validId, passwordHash: 'old' });

      const result = await service.updatePasswordHash(validId, 'new-hash');

      expect(result.passwordHash).toBe('new-hash');
    });
  });

  describe('markEmailVerified', () => {
    it('sets emailVerifiedAt', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: validId, emailVerifiedAt: null });

      const result = await service.markEmailVerified(validId);

      expect(result.emailVerifiedAt).toBeInstanceOf(Date);
    });
  });
});
