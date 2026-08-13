import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentStreamQueryService } from './content-stream-query.service';
import { ContentStream } from '../entities/content-stream.entity';

describe('ContentStreamQueryService', () => {
  let service: ContentStreamQueryService;

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  const mockQueryBuilder = {
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockContentStreamRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockUserSelectionsQueryBuilder = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockUserContentStreamRepo = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => mockUserSelectionsQueryBuilder),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContentStreamQueryService(
      mockContentStreamRepo as any,
      mockUserContentStreamRepo as any,
    );
  });

  describe('findAll', () => {
    it('filters to enabled streams by default, ordered by sortOrder', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll();

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('cs.sortOrder', 'ASC');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('cs.enabled = true');
    });

    it('does not filter by enabled when enabledOnly is false', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(false);

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the entity for a valid id', async () => {
      const entity = { id: validId } as ContentStream;
      mockContentStreamRepo.findOne.mockResolvedValue(entity);

      await expect(service.findOne(validId)).resolves.toEqual(entity);
    });

    it('throws BadRequestException for an invalid id format', async () => {
      await expect(service.findOne('not-a-uuid')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the entity does not exist', async () => {
      mockContentStreamRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(validId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findSelectedByUser', () => {
    it('returns [] without querying content streams when the user has no links', async () => {
      mockUserContentStreamRepo.find.mockResolvedValue([]);

      await expect(service.findSelectedByUser('user-1')).resolves.toEqual([]);
      expect(mockContentStreamRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('findByKey', () => {
    it('returns the entity for a matching key', async () => {
      const entity = { id: validId, key: 'security' } as ContentStream;
      mockContentStreamRepo.findOne.mockResolvedValue(entity);

      await expect(service.findByKey('security')).resolves.toEqual(entity);
      expect(mockContentStreamRepo.findOne).toHaveBeenCalledWith({ where: { key: 'security' } });
    });

    it('returns null when no stream matches the key', async () => {
      mockContentStreamRepo.findOne.mockResolvedValue(null);

      await expect(service.findByKey('not-a-real-key')).resolves.toBeNull();
    });
  });

  describe('findAllUserSelections', () => {
    it('returns all selections, flattened, when no email filter is given', async () => {
      const link = {
        userId: 'user-1',
        user: { email: 'jane@example.com' },
        contentStreamId: 'cs-1',
        contentStream: { key: 'security', name: 'Security' },
        createdAt: new Date('2024-01-01'),
      };
      mockUserSelectionsQueryBuilder.getManyAndCount.mockResolvedValue([[link], 1]);

      const result = await service.findAllUserSelections({ page: 1, limit: 20 });

      expect(mockUserSelectionsQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(result.data).toEqual([
        {
          userId: 'user-1',
          userEmail: 'jane@example.com',
          contentStreamId: 'cs-1',
          contentStreamKey: 'security',
          contentStreamName: 'Security',
          createdAt: link.createdAt,
        },
      ]);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('applies an ILIKE partial-match filter on the linked user email', async () => {
      mockUserSelectionsQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllUserSelections({ page: 1, limit: 20, email: 'jane' });

      expect(mockUserSelectionsQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.email ILIKE :email',
        { email: '%jane%' },
      );
    });

    it('paginates using skip/take derived from page/limit', async () => {
      mockUserSelectionsQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllUserSelections({ page: 2, limit: 5 });

      expect(mockUserSelectionsQueryBuilder.skip).toHaveBeenCalledWith(5);
      expect(mockUserSelectionsQueryBuilder.take).toHaveBeenCalledWith(5);
    });
  });
});
