import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArticleFeedbackType } from '../../articles/entities/article-feedback.entity';
import { UserSourcePreference } from '../entities/user-source-preference.entity';
import { UserSourcePreferenceService } from './user-source-preference.service';

const userId = 'default_user';
const sourceId = 'src-1';

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

const mockPreferenceRepo = {
  findOne: jest.fn(),
  create: jest.fn((data) => data),
  // Simulates postgres RETURNING backfilling column defaults on insert.
  save: jest.fn((data) =>
    Promise.resolve({
      ...data,
      usefulCount: data.usefulCount ?? 0,
      notUsefulCount: data.notUsefulCount ?? 0,
      feedbackAdjustment: data.feedbackAdjustment ?? 0,
    }),
  ),
  createQueryBuilder: jest.fn(() => mockAdminQueryBuilder),
};

describe('UserSourcePreferenceService', () => {
  let service: UserSourcePreferenceService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSourcePreferenceService,
        { provide: getRepositoryToken(UserSourcePreference), useValue: mockPreferenceRepo },
      ],
    }).compile();

    service = module.get(UserSourcePreferenceService);
  });

  describe('findOrCreate', () => {
    it('creates a new preference row when none exists', async () => {
      mockPreferenceRepo.findOne.mockResolvedValue(null);

      const result = await service.findOrCreate(userId, sourceId);

      expect(mockPreferenceRepo.create).toHaveBeenCalledWith({ userId, sourceId });
      expect(result.usefulCount).toBe(0);
      expect(result.notUsefulCount).toBe(0);
    });

    it('returns the existing row without creating a duplicate', async () => {
      const existing = { id: 'pref-1', userId, sourceId, usefulCount: 3, notUsefulCount: 1 };
      mockPreferenceRepo.findOne.mockResolvedValue(existing);

      const result = await service.findOrCreate(userId, sourceId);

      expect(mockPreferenceRepo.create).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  describe('applyFeedback', () => {
    it('increments usefulCount on first-time useful feedback', async () => {
      mockPreferenceRepo.findOne.mockResolvedValue(null);

      const result = await service.applyFeedback(userId, sourceId, ArticleFeedbackType.USEFUL);

      expect(result.usefulCount).toBe(1);
      expect(result.notUsefulCount).toBe(0);
    });

    it('increments notUsefulCount on first-time not_useful feedback', async () => {
      mockPreferenceRepo.findOne.mockResolvedValue(null);

      const result = await service.applyFeedback(userId, sourceId, ArticleFeedbackType.NOT_USEFUL);

      expect(result.usefulCount).toBe(0);
      expect(result.notUsefulCount).toBe(1);
    });

    it('moves the count from the old bucket to the new one on a type flip', async () => {
      const existing = { id: 'pref-1', userId, sourceId, usefulCount: 3, notUsefulCount: 1 };
      mockPreferenceRepo.findOne.mockResolvedValue(existing);

      const result = await service.applyFeedback(
        userId,
        sourceId,
        ArticleFeedbackType.NOT_USEFUL,
        ArticleFeedbackType.USEFUL,
      );

      expect(result.usefulCount).toBe(2);
      expect(result.notUsefulCount).toBe(2);
    });

    it('leaves counters unchanged when the feedback type is re-applied without a flip', async () => {
      const existing = { id: 'pref-1', userId, sourceId, usefulCount: 3, notUsefulCount: 1 };
      mockPreferenceRepo.findOne.mockResolvedValue(existing);

      const result = await service.applyFeedback(
        userId,
        sourceId,
        ArticleFeedbackType.USEFUL,
        ArticleFeedbackType.USEFUL,
      );

      expect(result.usefulCount).toBe(3);
      expect(result.notUsefulCount).toBe(1);
    });

    it('keeps the adjustment at 0 when there are no votes yet', async () => {
      const existing = { id: 'pref-1', userId, sourceId, usefulCount: 0, notUsefulCount: 0 };
      mockPreferenceRepo.findOne.mockResolvedValue(existing);

      const result = await service.applyFeedback(
        userId,
        sourceId,
        ArticleFeedbackType.USEFUL,
        ArticleFeedbackType.USEFUL,
      );

      expect(result.feedbackAdjustment).toBe(0);
    });

    it('clamps the adjustment at +8 for a heavily lopsided useful history', async () => {
      const existing = { id: 'pref-1', userId, sourceId, usefulCount: 49, notUsefulCount: 0 };
      mockPreferenceRepo.findOne.mockResolvedValue(existing);

      const result = await service.applyFeedback(userId, sourceId, ArticleFeedbackType.USEFUL);

      expect(result.usefulCount).toBe(50);
      expect(result.feedbackAdjustment).toBe(8);
    });

    it('clamps the adjustment at -8 for a heavily lopsided not_useful history', async () => {
      const existing = { id: 'pref-1', userId, sourceId, usefulCount: 0, notUsefulCount: 49 };
      mockPreferenceRepo.findOne.mockResolvedValue(existing);

      const result = await service.applyFeedback(userId, sourceId, ArticleFeedbackType.NOT_USEFUL);

      expect(result.notUsefulCount).toBe(50);
      expect(result.feedbackAdjustment).toBe(-8);
    });

    it('produces a small unclamped adjustment for a balanced history', async () => {
      const existing = { id: 'pref-1', userId, sourceId, usefulCount: 5, notUsefulCount: 5 };
      mockPreferenceRepo.findOne.mockResolvedValue(existing);

      const result = await service.applyFeedback(userId, sourceId, ArticleFeedbackType.USEFUL);

      // (6 - 5) / (6 + 5 + 6) * 12
      expect(result.feedbackAdjustment).toBeCloseTo((1 / 17) * 12, 5);
    });
  });

  describe('getAdjustment', () => {
    it('returns 0 when no preference row exists', async () => {
      mockPreferenceRepo.findOne.mockResolvedValue(null);

      const result = await service.getAdjustment(userId, sourceId);

      expect(result).toBe(0);
    });

    it('returns the stored adjustment as a number', async () => {
      mockPreferenceRepo.findOne.mockResolvedValue({ feedbackAdjustment: '3.25' });

      const result = await service.getAdjustment(userId, sourceId);

      expect(result).toBe(3.25);
    });
  });

  describe('findAllAdmin', () => {
    const preferenceEntity = {
      id: 'pref-1',
      userId,
      sourceId,
      source: { id: sourceId, name: 'The New Stack' },
      usefulCount: 3,
      notUsefulCount: 1,
      feedbackAdjustment: 2.5,
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
        'user.id::text = pref.userId',
      );
    });

    it('maps a row with no matching user to userEmail: null, not undefined', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(1);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [preferenceEntity],
        raw: [{ user_email: undefined }],
      });

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data[0].userEmail).toBeNull();
    });

    it('maps a row with a matching user to the resolved email', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(1);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [preferenceEntity],
        raw: [{ user_email: 'jane@example.com' }],
      });

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data[0].userEmail).toBe('jane@example.com');
      expect(result.data[0].sourceName).toBe('The New Stack');
      expect(result.data[0].feedbackAdjustment).toBe(2.5);
    });

    it('applies email and sourceId filters only when provided', async () => {
      mockAdminQueryBuilder.getCount.mockResolvedValue(0);
      mockAdminQueryBuilder.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await service.findAllAdmin({ page: 1, limit: 20, email: 'jane', sourceId: 'src-2' });

      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith('user.email ILIKE :email', {
        email: '%jane%',
      });
      expect(mockAdminQueryBuilder.andWhere).toHaveBeenCalledWith('pref.sourceId = :sourceId', {
        sourceId: 'src-2',
      });
    });

    it('does not apply filters when neither email nor sourceId is provided', async () => {
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
