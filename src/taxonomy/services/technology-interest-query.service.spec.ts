import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TechnologyInterestQueryService } from './technology-interest-query.service';
import { TechnologyInterest, TechnologyInterestKind } from '../entities/technology-interest.entity';

describe('TechnologyInterestQueryService', () => {
  let service: TechnologyInterestQueryService;

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockTechnologyInterestRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockUserTechnologyInterestRepo = {
    find: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TechnologyInterestQueryService(
      mockTechnologyInterestRepo as any,
      mockUserTechnologyInterestRepo as any,
    );
  });

  describe('findAll', () => {
    it('paginates with default params', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({});

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
    });

    it('filters by kind and search query', async () => {
      const items = [{ id: 'ti-1' }] as TechnologyInterest[];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([items, 1]);

      const result = await service.findAll({ kind: TechnologyInterestKind.TECHNOLOGY, q: 'node' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('ti.kind = :kind', {
        kind: TechnologyInterestKind.TECHNOLOGY,
      });
      expect(result.data).toEqual(items);
    });
  });

  describe('findOne', () => {
    it('returns the entity for a valid id', async () => {
      const entity = { id: validId } as TechnologyInterest;
      mockTechnologyInterestRepo.findOne.mockResolvedValue(entity);

      await expect(service.findOne(validId)).resolves.toEqual(entity);
    });

    it('throws BadRequestException for an invalid id format', async () => {
      await expect(service.findOne('not-a-uuid')).rejects.toThrow(BadRequestException);
      expect(mockTechnologyInterestRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the entity does not exist', async () => {
      mockTechnologyInterestRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(validId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByIds', () => {
    it('returns [] without querying when given no ids', async () => {
      await expect(service.findByIds([])).resolves.toEqual([]);
      expect(mockTechnologyInterestRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('findSelectedByUser', () => {
    it('returns [] without querying technology interests when the user has no links', async () => {
      mockUserTechnologyInterestRepo.find.mockResolvedValue([]);

      await expect(service.findSelectedByUser('user-1')).resolves.toEqual([]);
      expect(mockTechnologyInterestRepo.find).not.toHaveBeenCalled();
    });

    it('resolves linked technology interests for the user', async () => {
      mockUserTechnologyInterestRepo.find.mockResolvedValue([
        { technologyInterestId: 'ti-1' },
        { technologyInterestId: 'ti-2' },
      ]);
      const entities = [{ id: 'ti-1' }, { id: 'ti-2' }] as TechnologyInterest[];
      mockTechnologyInterestRepo.find.mockResolvedValue(entities);

      await expect(service.findSelectedByUser('user-1')).resolves.toEqual(entities);
    });
  });
});
