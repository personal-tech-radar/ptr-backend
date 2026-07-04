import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArticleFeedbackType } from '../../articles/entities/article-feedback.entity';
import { UserSourcePreference } from '../entities/user-source-preference.entity';
import { UserSourcePreferenceService } from './user-source-preference.service';

const userId = 'default_user';
const sourceId = 'src-1';

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
});
