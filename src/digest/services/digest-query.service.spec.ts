import { NotFoundException } from '@nestjs/common';
import { DigestQueryService } from './digest-query.service';
import { Digest, DigestStatus, DigestType } from '../entities/digest.entity';

describe('DigestQueryService', () => {
  let service: DigestQueryService;

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockDigestRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DigestQueryService(mockDigestRepo as any);
  });

  describe('findById', () => {
    it('returns the digest for a valid id', async () => {
      const digest = { id: validId } as Digest;
      mockDigestRepo.findOne.mockResolvedValue(digest);

      await expect(service.findById(validId)).resolves.toEqual(digest);
    });

    it('throws NotFoundException when no digest matches', async () => {
      mockDigestRepo.findOne.mockResolvedValue(null);

      await expect(service.findById(validId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('applies no filters and paginates using default params', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('digest.createdAt', 'DESC');
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
    });

    it('filters by type when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, limit: 20, type: DigestType.DAILY });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('digest.type = :type', {
        type: DigestType.DAILY,
      });
    });

    it('filters by status when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, limit: 20, status: DigestStatus.SENT });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('digest.status = :status', {
        status: DigestStatus.SENT,
      });
    });

    it('maps entities to the response shape and computes pagination math', async () => {
      const digest = {
        id: validId,
        type: DigestType.DAILY,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-02'),
        subject: 'Subject',
        status: DigestStatus.SENT,
        sentAt: new Date('2026-01-02'),
        createdAt: new Date('2026-01-01'),
      } as Digest;
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[digest], 21]);

      const result = await service.findAll({ page: 2, limit: 20 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(result.data).toEqual([
        {
          id: validId,
          type: DigestType.DAILY,
          periodStart: digest.periodStart,
          periodEnd: digest.periodEnd,
          subject: 'Subject',
          status: DigestStatus.SENT,
          sentAt: digest.sentAt,
          createdAt: digest.createdAt,
        },
      ]);
      expect(result.meta).toEqual({ total: 21, page: 2, limit: 20, totalPages: 2 });
    });
  });

  describe('findByIdWithItems', () => {
    it('returns the digest with items and article relations loaded', async () => {
      const digest = { id: validId, items: [] } as unknown as Digest;
      mockDigestRepo.findOne.mockResolvedValue(digest);

      await expect(service.findByIdWithItems(validId)).resolves.toEqual(digest);
      expect(mockDigestRepo.findOne).toHaveBeenCalledWith({
        where: { id: validId },
        relations: ['items', 'items.article'],
      });
    });

    it('throws NotFoundException when no digest matches', async () => {
      mockDigestRepo.findOne.mockResolvedValue(null);

      await expect(service.findByIdWithItems(validId)).rejects.toThrow(NotFoundException);
    });
  });
});
