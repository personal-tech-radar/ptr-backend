import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ArticlesService } from '../../articles/services/articles.service';
import { SavedArticleService } from './saved-article.service';
import { SavedArticle } from '../entities/saved-article.entity';

const userId = '123e4567-e89b-12d3-a456-426614174000';
const articleId = '223e4567-e89b-12d3-a456-426614174000';
const article = { id: articleId, title: 'Some article' };

const mockRepository = {
  findOne: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: 'sa-1', ...data })),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockArticlesService = {
  findOne: jest.fn(),
};

describe('SavedArticleService', () => {
  let service: SavedArticleService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockArticlesService.findOne.mockResolvedValue(article);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedArticleService,
        { provide: getRepositoryToken(SavedArticle), useValue: mockRepository },
        { provide: ArticlesService, useValue: mockArticlesService },
      ],
    }).compile();

    service = module.get(SavedArticleService);
  });

  describe('create', () => {
    it('saves an article that was not previously saved', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(null) // find-or-create check
        .mockResolvedValueOnce({ id: 'sa-1', userId, articleId, article, createdAt: new Date() }); // post-save reload

      const result = await service.create(userId, articleId);

      expect(mockArticlesService.findOne).toHaveBeenCalledWith(articleId);
      expect(mockRepository.create).toHaveBeenCalledWith({ userId, articleId });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('sa-1');
    });

    it('throws when the article does not exist', async () => {
      mockArticlesService.findOne.mockRejectedValue(new NotFoundException('Article not found'));

      await expect(service.create(userId, articleId)).rejects.toThrow(NotFoundException);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('is idempotent — returns the existing row when already saved, without saving again', async () => {
      const existing = { id: 'sa-1', userId, articleId, article, createdAt: new Date() };
      mockRepository.findOne.mockResolvedValueOnce(existing);

      const result = await service.create(userId, articleId);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('recovers from a concurrent-insert unique-constraint violation by refetching the winning row', async () => {
      const winningRow = { id: 'sa-1', userId, articleId, article, createdAt: new Date() };
      mockRepository.findOne
        .mockResolvedValueOnce(null) // find-or-create check finds nothing
        .mockResolvedValueOnce(winningRow); // refetch after the race finds the concurrent insert
      mockRepository.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        }),
      );

      const result = await service.create(userId, articleId);

      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      expect(mockRepository.findOne).toHaveBeenCalledTimes(2);
      expect(result).toBe(winningRow);
    });

    it('rethrows when save() fails and the refetch still finds nothing (not a duplicate-key race)', async () => {
      const saveError = new Error('some other database error');
      mockRepository.findOne
        .mockResolvedValueOnce(null) // find-or-create check finds nothing
        .mockResolvedValueOnce(null); // refetch after the failed save also finds nothing
      mockRepository.save.mockRejectedValueOnce(saveError);

      await expect(service.create(userId, articleId)).rejects.toThrow(saveError);
    });
  });

  describe('remove', () => {
    it('deletes the saved-article row', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove(userId, articleId);

      expect(mockRepository.delete).toHaveBeenCalledWith({ userId, articleId });
    });

    it('is idempotent — no error when the article was not currently saved', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove(userId, articleId)).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns paginated saved articles for the user', async () => {
      const rows = [{ id: 'sa-1', userId, articleId, article, createdAt: new Date() }];
      const mockQueryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([rows, 1]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(userId, 1, 20);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('savedArticle.userId = :userId', {
        userId,
      });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });
  });
});
