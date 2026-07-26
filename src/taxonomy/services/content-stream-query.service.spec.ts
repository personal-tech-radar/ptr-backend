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

  const mockUserContentStreamRepo = {
    find: jest.fn(),
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
});
