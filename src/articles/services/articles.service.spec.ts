import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArticlesService } from './articles.service';
import { Article } from '../entities/article.entity';

describe('ArticlesService', () => {
  let service: ArticlesService;

  const mockArticleRepo = {
    findOne: jest.fn(),
    softDelete: jest.fn(),
  };

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: getRepositoryToken(Article), useValue: mockArticleRepo },
      ],
    }).compile();

    service = module.get<ArticlesService>(ArticlesService);
  });

  describe('remove', () => {
    it('soft-deletes an existing article', async () => {
      mockArticleRepo.findOne.mockResolvedValue({ id: validId });

      await service.remove(validId);

      expect(mockArticleRepo.softDelete).toHaveBeenCalledWith(validId);
    });

    it('throws NotFoundException when the article does not exist', async () => {
      mockArticleRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(validId)).rejects.toThrow(NotFoundException);
      expect(mockArticleRepo.softDelete).not.toHaveBeenCalled();
    });
  });
});
