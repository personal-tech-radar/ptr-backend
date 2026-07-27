import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PersonalArticleLinkService } from './personal-article-link.service';
import {
  PersonalArticleLink,
  PersonalArticleLinkContext,
} from '../entities/personal-article-link.entity';

const userId = '123e4567-e89b-12d3-a456-426614174000';
const articleId = '223e4567-e89b-12d3-a456-426614174000';
const linkId = '323e4567-e89b-12d3-a456-426614174000';
const article = { id: articleId, url: 'https://example.com/article' };

const mockRepository = {
  findOne: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: linkId, ...data })),
};

describe('PersonalArticleLinkService', () => {
  let service: PersonalArticleLinkService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalArticleLinkService,
        { provide: getRepositoryToken(PersonalArticleLink), useValue: mockRepository },
      ],
    }).compile();

    service = module.get(PersonalArticleLinkService);
  });

  describe('findOrCreateLink', () => {
    it('creates a new link when none exists for the triple', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOrCreateLink(
        userId,
        articleId,
        PersonalArticleLinkContext.FEED,
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        userId,
        articleId,
        context: PersonalArticleLinkContext.FEED,
      });
      expect(result.id).toBe(linkId);
    });

    it('returns the same row on a second call with the identical triple, not a new row', async () => {
      const existing = { id: linkId, userId, articleId, context: PersonalArticleLinkContext.FEED };
      mockRepository.findOne.mockResolvedValue(existing);

      const result = await service.findOrCreateLink(
        userId,
        articleId,
        PersonalArticleLinkContext.FEED,
      );

      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('recovers from a concurrent-insert unique-constraint violation by refetching the winning row', async () => {
      const winningRow = {
        id: linkId,
        userId,
        articleId,
        context: PersonalArticleLinkContext.FEED,
      };
      mockRepository.findOne
        .mockResolvedValueOnce(null) // initial existence check finds nothing
        .mockResolvedValueOnce(winningRow); // refetch after the race finds the concurrent insert
      mockRepository.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        }),
      );

      const result = await service.findOrCreateLink(
        userId,
        articleId,
        PersonalArticleLinkContext.FEED,
      );

      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      expect(mockRepository.findOne).toHaveBeenCalledTimes(2);
      expect(result).toBe(winningRow);
    });

    it('rethrows when save() fails and the refetch still finds nothing (not a duplicate-key race)', async () => {
      const saveError = new Error('some other database error');
      mockRepository.findOne
        .mockResolvedValueOnce(null) // initial existence check finds nothing
        .mockResolvedValueOnce(null); // refetch after the failed save also finds nothing
      mockRepository.save.mockRejectedValueOnce(saveError);

      await expect(
        service.findOrCreateLink(userId, articleId, PersonalArticleLinkContext.FEED),
      ).rejects.toThrow(saveError);
    });
  });

  describe('resolveAndRecordOpen', () => {
    it('sets firstOpenedAt on the first open and returns the article', async () => {
      const link = { id: linkId, article, firstOpenedAt: null };
      mockRepository.findOne.mockResolvedValue(link);

      const result = await service.resolveAndRecordOpen(linkId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstOpenedAt: expect.any(Date) }),
      );
      expect(result.article).toBe(article);
    });

    it('leaves firstOpenedAt untouched on a subsequent open', async () => {
      const alreadyOpenedAt = new Date('2026-01-01T00:00:00Z');
      const link = { id: linkId, article, firstOpenedAt: alreadyOpenedAt };
      mockRepository.findOne.mockResolvedValue(link);

      const result = await service.resolveAndRecordOpen(linkId);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(link.firstOpenedAt).toBe(alreadyOpenedAt);
      expect(result.article).toBe(article);
    });

    it('throws NotFoundException for an unknown linkId', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.resolveAndRecordOpen(linkId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a malformed linkId without querying the repository', async () => {
      await expect(service.resolveAndRecordOpen('not-a-uuid')).rejects.toThrow(NotFoundException);
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
