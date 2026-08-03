import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserQueryService } from './user-query.service';
import { User } from '../entities/user.entity';

describe('UserQueryService', () => {
  let service: UserQueryService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getMany: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [UserQueryService, { provide: getRepositoryToken(User), useValue: mockUserRepo }],
    }).compile();

    service = module.get<UserQueryService>(UserQueryService);
  });

  describe('findById', () => {
    it('returns a user by valid ID', async () => {
      const mockUser = { id: validId, email: 'jane@example.com' };
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findById(validId);
      expect(result).toEqual(mockUser);
    });

    it('throws BadRequestException for invalid ID format', async () => {
      await expect(service.findById('not-a-uuid')).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist (including soft-deleted)', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.findById(validId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('returns the user when found', async () => {
      const mockUser = { id: validId, email: 'jane@example.com' };
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('jane@example.com');
      expect(result).toEqual(mockUser);
    });

    it('returns null when not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const result = await service.findByEmail('missing@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findByEmailIncludingDeleted', () => {
    it('returns a soft-deleted user, unlike findByEmail', async () => {
      const softDeletedUser = { id: validId, email: 'jane@example.com', deletedAt: new Date() };
      mockUserRepo.findOne.mockResolvedValue(softDeletedUser);

      const result = await service.findByEmailIncludingDeleted('jane@example.com');

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'jane@example.com' },
        withDeleted: true,
      });
      expect(result).toEqual(softDeletedUser);
    });
  });

  describe('findAll', () => {
    it('returns paginated results with default params', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[{ id: validId }], 1]);

      const result = await service.findAll({});

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.withDeleted).not.toHaveBeenCalled();
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('applies an email ILIKE filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ email: 'jane' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.email ILIKE :email', {
        email: '%jane%',
      });
    });

    it('only includes soft-deleted users when includeDeleted is explicitly true', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ includeDeleted: true });

      expect(mockQueryBuilder.withDeleted).toHaveBeenCalledTimes(1);
    });
  });

  describe('findEligibleForDigestSweep', () => {
    beforeEach(() => {
      mockQueryBuilder.getMany.mockResolvedValue([{ id: validId }]);
    });

    it('excludes soft-deleted users', async () => {
      await service.findEligibleForDigestSweep();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.deletedAt IS NULL');
    });

    it('excludes users who have not completed onboarding', async () => {
      await service.findEligibleForDigestSweep();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.onboardingCompletedAt IS NOT NULL',
      );
    });

    // Verification is a hard gate for scheduled digests.
    it('excludes users with an unverified email', async () => {
      await service.findEligibleForDigestSweep();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.emailVerifiedAt IS NOT NULL');
    });

    it('requires at least one of dailyDigestEnabled/weeklyDigestEnabled to be true', async () => {
      await service.findEligibleForDigestSweep();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(user.dailyDigestEnabled = true OR user.weeklyDigestEnabled = true)',
      );
    });

    it('requires verification and onboarding together before enabled digest settings matter', async () => {
      await service.findEligibleForDigestSweep();

      expect(mockQueryBuilder.andWhere.mock.calls.map(([clause]) => clause)).toEqual(
        expect.arrayContaining([
          'user.onboardingCompletedAt IS NOT NULL',
          'user.emailVerifiedAt IS NOT NULL',
          '(user.dailyDigestEnabled = true OR user.weeklyDigestEnabled = true)',
        ]),
      );
    });

    it('returns the query result', async () => {
      const result = await service.findEligibleForDigestSweep();

      expect(result).toEqual([{ id: validId }]);
    });
  });
});
