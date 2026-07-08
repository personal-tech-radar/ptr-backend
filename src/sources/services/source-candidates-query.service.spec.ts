import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SourceCandidatesQueryService } from './source-candidates-query.service';
import { SourceCandidateStatus } from '../entities/source-candidate.entity';

describe('SourceCandidatesQueryService', () => {
  let service: SourceCandidatesQueryService;

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockCandidateRepo = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCandidateRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    service = new SourceCandidatesQueryService(mockCandidateRepo as any);
  });

  describe('findAll', () => {
    it('applies default pagination and returns the correct meta shape', async () => {
      const items = [{ id: '1' }, { id: '2' }];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([items, 2]);

      const result = await service.findAll({});

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: items,
        meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
      });
    });

    it('filters by status when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ status: SourceCandidateStatus.NEEDS_REVIEW, page: 2, limit: 10 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('candidate.status = :status', {
        status: SourceCandidateStatus.NEEDS_REVIEW,
      });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });
  });

  describe('findOne', () => {
    it('returns the candidate for a valid ID', async () => {
      const candidate = { id: validId };
      mockCandidateRepo.findOne.mockResolvedValue(candidate);

      const result = await service.findOne(validId);
      expect(result).toEqual(candidate);
    });

    it('throws BadRequestException for an invalid ID format', async () => {
      await expect(service.findOne('not-a-uuid')).rejects.toThrow(BadRequestException);
      expect(mockCandidateRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the candidate does not exist', async () => {
      mockCandidateRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(validId)).rejects.toThrow(NotFoundException);
    });
  });
});
