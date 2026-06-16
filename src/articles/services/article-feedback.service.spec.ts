import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ArticleFeedback, ArticleFeedbackType } from '../entities/article-feedback.entity';
import { Source } from '../../sources/entities/source.entity';
import { ArticlesService } from './articles.service';
import { ArticleFeedbackService } from './article-feedback.service';

const DEFAULT_USER_ID = 'default_user';
const articleId = 'a-1';

const mockFeedbackRepo = {
  findOne: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: 'fb-1', ...data })),
  createQueryBuilder: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  }),
};

const mockSourceRepo = {
  update: jest.fn().mockResolvedValue(undefined),
};

const mockArticlesService = {
  findOne: jest.fn().mockResolvedValue({ id: articleId, sourceId: 'src-1' }),
};

describe('ArticleFeedbackService', () => {
  let service: ArticleFeedbackService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockArticlesService.findOne.mockResolvedValue({ id: articleId, sourceId: 'src-1' });
    mockFeedbackRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticleFeedbackService,
        {
          provide: getRepositoryToken(ArticleFeedback),
          useValue: mockFeedbackRepo,
        },
        {
          provide: getRepositoryToken(Source),
          useValue: mockSourceRepo,
        },
        { provide: ArticlesService, useValue: mockArticlesService },
      ],
    }).compile();

    service = module.get(ArticleFeedbackService);
  });

  describe('upsertFeedback', () => {
    it('creates feedback when none exists for this article and user', async () => {
      mockFeedbackRepo.findOne.mockResolvedValue(null);

      const result = await service.upsertFeedback(articleId, ArticleFeedbackType.USEFUL);

      expect(mockArticlesService.findOne).toHaveBeenCalledWith(articleId);
      expect(mockFeedbackRepo.create).toHaveBeenCalledWith({
        articleId,
        userId: DEFAULT_USER_ID,
        type: ArticleFeedbackType.USEFUL,
      });
      expect(mockFeedbackRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          articleId,
          userId: DEFAULT_USER_ID,
          type: ArticleFeedbackType.USEFUL,
        }),
      );
      expect(result.type).toBe(ArticleFeedbackType.USEFUL);
    });

    it('updates the existing feedback instead of creating a duplicate', async () => {
      const existing: Partial<ArticleFeedback> = {
        id: 'fb-1',
        articleId,
        userId: DEFAULT_USER_ID,
        type: ArticleFeedbackType.USEFUL,
      };
      mockFeedbackRepo.findOne.mockResolvedValue(existing);

      const result = await service.upsertFeedback(articleId, ArticleFeedbackType.NOT_USEFUL);

      expect(mockFeedbackRepo.create).not.toHaveBeenCalled();
      expect(mockFeedbackRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'fb-1',
          type: ArticleFeedbackType.NOT_USEFUL,
        }),
      );
      expect(result.id).toBe('fb-1');
      expect(result.type).toBe(ArticleFeedbackType.NOT_USEFUL);
    });

    it('propagates NotFoundException when the article does not exist', async () => {
      mockArticlesService.findOne.mockRejectedValue(new NotFoundException('Article not found'));

      await expect(service.upsertFeedback(articleId, ArticleFeedbackType.USEFUL)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockFeedbackRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
