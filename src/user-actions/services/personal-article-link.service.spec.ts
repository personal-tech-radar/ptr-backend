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
  find: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: linkId, ...data })),
  createQueryBuilder: jest.fn(),
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

  describe('findOrCreateLinksBatch', () => {
    const articleId2 = '423e4567-e89b-12d3-a456-426614174000';
    const articleId3 = '523e4567-e89b-12d3-a456-426614174000';
    const linkId2 = '623e4567-e89b-12d3-a456-426614174000';
    const linkId3 = '723e4567-e89b-12d3-a456-426614174000';

    it('returns an empty map for an empty article id list without querying the repository', async () => {
      const result = await service.findOrCreateLinksBatch(
        userId,
        [],
        PersonalArticleLinkContext.FEED,
      );

      expect(result.size).toBe(0);
      expect(mockRepository.find).not.toHaveBeenCalled();
    });

    it('returns a complete map covering a mix of existing and missing article ids', async () => {
      mockRepository.find.mockResolvedValueOnce([
        { id: linkId, userId, articleId, context: PersonalArticleLinkContext.FEED },
      ]); // existence check: only `articleId` already has a link
      mockRepository.save.mockResolvedValueOnce([
        { id: linkId2, userId, articleId: articleId2, context: PersonalArticleLinkContext.FEED },
        { id: linkId3, userId, articleId: articleId3, context: PersonalArticleLinkContext.FEED },
      ]);

      const result = await service.findOrCreateLinksBatch(
        userId,
        [articleId, articleId2, articleId3],
        PersonalArticleLinkContext.FEED,
      );

      expect(result.get(articleId)).toBe(linkId);
      expect(result.get(articleId2)).toBe(linkId2);
      expect(result.get(articleId3)).toBe(linkId3);
      expect(result.size).toBe(3);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('recovers from a concurrent-insert race by refetching the winning rows for the raced ids', async () => {
      mockRepository.find
        .mockResolvedValueOnce([]) // existence check: nothing exists yet
        .mockResolvedValueOnce([
          { id: linkId2, userId, articleId: articleId2, context: PersonalArticleLinkContext.FEED },
        ]); // refetch after the batch save fails: articleId2 won the race, articleId3 still missing
      // articleId3 falls back to the single-row findOrCreateLink, which uses findOne/save.
      mockRepository.findOne.mockResolvedValueOnce(null);
      mockRepository.save
        .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
        .mockResolvedValueOnce({
          id: linkId3,
          userId,
          articleId: articleId3,
          context: PersonalArticleLinkContext.FEED,
        });

      const result = await service.findOrCreateLinksBatch(
        userId,
        [articleId2, articleId3],
        PersonalArticleLinkContext.FEED,
      );

      expect(result.get(articleId2)).toBe(linkId2);
      expect(result.get(articleId3)).toBe(linkId3);
      expect(result.size).toBe(2);
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

  describe('findAllAdmin', () => {
    const user = { id: userId, email: 'jane@example.com' };
    const openedLink = {
      id: linkId,
      userId,
      user,
      articleId,
      article,
      context: PersonalArticleLinkContext.FEED,
      firstOpenedAt: new Date('2026-01-01'),
      createdAt: new Date('2025-12-31'),
    };

    const mockAdminQueryBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    beforeEach(() => {
      mockRepository.createQueryBuilder.mockReturnValue(mockAdminQueryBuilder);
    });

    it('returns all links across users, flattened, when no filters are given', async () => {
      mockAdminQueryBuilder.getManyAndCount.mockResolvedValue([[openedLink], 1]);

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(mockAdminQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(result.data[0].userEmail).toBe('jane@example.com');
      expect(result.data[0].opened).toBe(true);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('applies the email and context filters only when provided', async () => {
      mockAdminQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllAdmin({
        page: 1,
        limit: 20,
        email: 'jane',
        context: PersonalArticleLinkContext.DAILY_DIGEST,
      });

      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith('user.email ILIKE :email', {
        email: '%jane%',
      });
      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith('link.context = :context', {
        context: PersonalArticleLinkContext.DAILY_DIGEST,
      });
    });

    it('filters to opened links when opened=true', async () => {
      mockAdminQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllAdmin({ page: 1, limit: 20, opened: true });

      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith('link.firstOpenedAt IS NOT NULL');
      expect(mockAdminQueryBuilder.andWhere).not.toHaveBeenCalledWith('link.firstOpenedAt IS NULL');
    });

    // Regression test for the boolean-query-param coercion bug (fixed 3 times already in this
    // program — see QueryUserDto's toBoolean, AdminQueryOpensDto's toBoolean). opened=false must
    // filter to UN-opened links, not be silently treated as opened=true.
    it('filters to un-opened links when opened=false, not silently coerced to true', async () => {
      mockAdminQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllAdmin({ page: 1, limit: 20, opened: false });

      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith('link.firstOpenedAt IS NULL');
      expect(mockAdminQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        'link.firstOpenedAt IS NOT NULL',
      );
    });

    it('applies no opened filter when opened is undefined', async () => {
      mockAdminQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllAdmin({ page: 1, limit: 20 });

      expect(mockAdminQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('firstOpenedAt'),
      );
    });

    it('derives opened: false in the response when firstOpenedAt is null', async () => {
      const unopenedLink = { ...openedLink, firstOpenedAt: null };
      mockAdminQueryBuilder.getManyAndCount.mockResolvedValue([[unopenedLink], 1]);

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data[0].opened).toBe(false);
      expect(result.data[0].firstOpenedAt).toBeNull();
    });

    it('paginates using skip/take derived from page/limit', async () => {
      mockAdminQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllAdmin({ page: 2, limit: 5 });

      expect(mockAdminQueryBuilder.skip).toHaveBeenCalledWith(5);
      expect(mockAdminQueryBuilder.take).toHaveBeenCalledWith(5);
    });
  });
});
