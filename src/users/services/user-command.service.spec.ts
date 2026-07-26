import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserCommandService } from './user-command.service';
import { User, UserRole } from '../entities/user.entity';

describe('UserCommandService', () => {
  let service: UserCommandService;

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ id: 'generated-id', role: UserRole.USER, ...data })),
    softDelete: jest.fn(),
  };

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserCommandService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
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
