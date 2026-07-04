import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ArticleFeedback, ArticleFeedbackType } from '../entities/article-feedback.entity';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { ArticlesService } from './articles.service';
import { ArticleFeedbackService } from './article-feedback.service';

const DEFAULT_USER_ID = 'default_user';
const articleId = 'a-1';

const mockFeedbackRepo = {
  findOne: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: 'fb-1', ...data })),
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
});
