import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ArticleFeedback, ArticleFeedbackType } from '../entities/article-feedback.entity';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { ArticlesService } from './articles.service';
import { ArticleFeedbackService } from './article-feedback.service';

const DEFAULT_USER_ID = 'default_user';
const articleId = 'a-1';

const mockAdminQueryBuilder = {
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  clone: jest.fn().mockReturnThis(),
  getCount: jest.fn(),
  getRawAndEntities: jest.fn(),
};

const mockFeedbackRepo = {
  findOne: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: 'fb-1', ...data })),
  createQueryBuilder: jest.fn(() => mockAdminQueryBuilder),
};

const mockArticlesService = {
  findOne: jest.fn().mockResolvedValue({ id: articleId, sourceId: 'src-1' }),
};

const mockUserSourcePreferenceService = {
  applyFeedback: jest.fn().mockResolvedValue(undefined),
};

describe('ArticleFeedbackService', () => {
  let service: ArticleFeedbackService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockArticlesService.findOne.mockResolvedValue({ id: articleId, sourceId: 'src-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticleFeedbackService,
        {
          provide: getRepositoryToken(ArticleFeedback),
          useValue: mockFeedbackRepo,
        },
        { provide: ArticlesService, useValue: mockArticlesService },
        { provide: UserSourcePreferenceService, useValue: mockUserSourcePreferenceService },
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

    it('does not touch Source at all — only calls the preference service', async () => {
      mockFeedbackRepo.findOne.mockResolvedValue(null);

      await service.upsertFeedback(articleId, ArticleFeedbackType.USEFUL);

      expect(mockUserSourcePreferenceService.applyFeedback).toHaveBeenCalledWith(
        DEFAULT_USER_ID,
        'src-1',
        ArticleFeedbackType.USEFUL,
        null,
      );
    });

    it('updates the existing feedback with the same type without flipping counters', async () => {
      const existing: Partial<ArticleFeedback> = {
        id: 'fb-1',
        articleId,
        userId: DEFAULT_USER_ID,
        type: ArticleFeedbackType.USEFUL,
      };
      mockFeedbackRepo.findOne.mockResolvedValue(existing);

      const result = await service.upsertFeedback(articleId, ArticleFeedbackType.USEFUL);

      expect(mockFeedbackRepo.create).not.toHaveBeenCalled();
      expect(result.type).toBe(ArticleFeedbackType.USEFUL);
      expect(mockUserSourcePreferenceService.applyFeedback).toHaveBeenCalledWith(
        DEFAULT_USER_ID,
        'src-1',
        ArticleFeedbackType.USEFUL,
        ArticleFeedbackType.USEFUL,
      );
    });

    it('updates the existing feedback and reports the type flip to the preference service', async () => {
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
      expect(mockUserSourcePreferenceService.applyFeedback).toHaveBeenCalledWith(
        DEFAULT_USER_ID,
        'src-1',
        ArticleFeedbackType.NOT_USEFUL,
        ArticleFeedbackType.USEFUL,
      );
    });

    it('propagates NotFoundException when the article does not exist', async () => {
      mockArticlesService.findOne.mockRejectedValue(new NotFoundException('Article not found'));

      await expect(service.upsertFeedback(articleId, ArticleFeedbackType.USEFUL)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockFeedbackRepo.findOne).not.toHaveBeenCalled();
      expect(mockUserSourcePreferenceService.applyFeedback).not.toHaveBeenCalled();
    });
  });

  describe('findAllAdmin', () => {
    const feedbackEntity = {
      id: 'fb-1',
      articleId,
      article: { id: articleId, title: 'How we cut p99 latency in half' },
      userId: DEFAULT_USER_ID,
      type: ArticleFeedbackType.USEFUL,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    };

    it('joins User via an id::text cast rather than a declared relation', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(0);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await service.findAllAdmin({ page: 1, limit: 20 });

      expect(mockAdminQueryBuilder.leftJoin).toHaveBeenCalledWith(
        expect.anything(),
        'user',
        'user.id::text = feedback.userId',
      );
    });

    it('maps a row with no matching user to userEmail: null, not undefined', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(1);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [feedbackEntity],
        raw: [{ user_email: undefined }],
      });

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data[0].userEmail).toBeNull();
      expect(result.data[0].articleTitle).toBe('How we cut p99 latency in half');
    });

    it('maps a row with a matching user to the resolved email', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(1);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [feedbackEntity],
        raw: [{ user_email: 'jane@example.com' }],
      });

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data[0].userEmail).toBe('jane@example.com');
    });

    it('applies email, articleId, and type filters only when provided', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(0);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await service.findAllAdmin({
        page: 1,
        limit: 20,
        email: 'jane',
        articleId: 'article-2',
        type: ArticleFeedbackType.NOT_USEFUL,
      });

      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith('user.email ILIKE :email', {
        email: '%jane%',
      });
      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith(
        'feedback.articleId = :articleId',
        { articleId: 'article-2' },
      );
      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith('feedback.type = :type', {
        type: ArticleFeedbackType.NOT_USEFUL,
      });
    });

    it('does not apply filters when none are provided', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(0);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await service.findAllAdmin({ page: 1, limit: 20 });

      expect(mockAdminQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('derives the count from a cloned query builder and paginates the main query with skip/take', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(45);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      const result = await service.findAllAdmin({ page: 3, limit: 20 });

      expect(mockAdminQueryBuilder.clone).toHaveBeenCalled();
      expect(mockAdminQueryBuilder.skip).toHaveBeenCalledWith(40);
      expect(mockAdminQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.meta).toEqual({ total: 45, page: 3, limit: 20, totalPages: 3 });
    });
  });
});
