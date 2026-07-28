import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserQueryService } from './user-query.service';
import { User, UserRole } from '../entities/user.entity';

describe('UserQueryService', () => {
  let service: UserQueryService;

  const mockQueryBuilder = {
    withDeleted: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
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

    it('applies an exact role filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ role: UserRole.ADMIN });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.role = :role', {
        role: UserRole.ADMIN,
      });
    });

    it('only includes soft-deleted users when includeDeleted is explicitly true', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ includeDeleted: true });

      expect(mockQueryBuilder.withDeleted).toHaveBeenCalledTimes(1);
    });
  });
});
