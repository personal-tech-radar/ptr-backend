import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ArticleFeedback,
  ArticleFeedbackType,
} from '../../articles/entities/article-feedback.entity';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { UserLevel } from '../../users/entities/user.entity';
import { UserQueryService } from '../../users/services/user-query.service';
import { UserScoringProfileService } from './user-scoring-profile.service';

describe('UserScoringProfileService', () => {
  let service: UserScoringProfileService;

  const mockArticleFeedbackRepo = {
    find: jest.fn(),
  };

  const mockTechnologyInterestQueryService = {
    findSelectedByUser: jest.fn(),
  };

  const mockContentStreamQueryService = {
    findSelectedByUser: jest.fn(),
  };

  const mockUserSourcePreferenceService = {
    getAdjustmentsForSources: jest.fn(),
  };

  const mockUserQueryService = {
    findById: jest.fn(),
  };

  const userId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserScoringProfileService,
        { provide: getRepositoryToken(ArticleFeedback), useValue: mockArticleFeedbackRepo },
        {
          provide: TechnologyInterestQueryService,
          useValue: mockTechnologyInterestQueryService,
        },
        { provide: ContentStreamQueryService, useValue: mockContentStreamQueryService },
        { provide: UserSourcePreferenceService, useValue: mockUserSourcePreferenceService },
        { provide: UserQueryService, useValue: mockUserQueryService },
      ],
    }).compile();

    service = module.get(UserScoringProfileService);
  });

  it('builds a correct profile from a fully-onboarded user selections and level', async () => {
    mockTechnologyInterestQueryService.findSelectedByUser.mockResolvedValue([
      { id: 'ti-1' },
      { id: 'ti-2' },
    ]);
    mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([{ id: 'stream-1' }]);
    mockUserQueryService.findById.mockResolvedValue({ id: userId, level: UserLevel.SENIOR });
    mockUserSourcePreferenceService.getAdjustmentsForSources.mockResolvedValue(
      new Map([['src-1', 4]]),
    );
    mockArticleFeedbackRepo.find.mockResolvedValue([
      { articleId: 'a-1', type: ArticleFeedbackType.USEFUL },
    ]);

    const profile = await service.buildProfile(userId, ['src-1'], ['a-1']);

    expect(profile).toEqual({
      technologyInterestIds: ['ti-1', 'ti-2'],
      contentStreamIds: ['stream-1'],
      level: UserLevel.SENIOR,
      sourcePreferenceAdjustments: new Map([['src-1', 4]]),
      articleFeedback: new Map([['a-1', ArticleFeedbackType.USEFUL]]),
    });
  });

  it('returns empty arrays with no crash for a pre-onboarding user with no selections', async () => {
    mockTechnologyInterestQueryService.findSelectedByUser.mockResolvedValue([]);
    mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([]);
    mockUserQueryService.findById.mockResolvedValue({ id: userId, level: null });
    mockUserSourcePreferenceService.getAdjustmentsForSources.mockResolvedValue(new Map());
    mockArticleFeedbackRepo.find.mockResolvedValue([]);

    const profile = await service.buildProfile(userId, [], []);

    expect(profile.technologyInterestIds).toEqual([]);
    expect(profile.contentStreamIds).toEqual([]);
    expect(profile.level).toBeNull();
  });

  it('returns empty maps with no query error when candidateSourceIds/candidateArticleIds are empty', async () => {
    mockTechnologyInterestQueryService.findSelectedByUser.mockResolvedValue([]);
    mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([]);
    mockUserQueryService.findById.mockResolvedValue({ id: userId, level: null });
    mockUserSourcePreferenceService.getAdjustmentsForSources.mockResolvedValue(new Map());

    const profile = await service.buildProfile(userId, [], []);

    expect(mockArticleFeedbackRepo.find).not.toHaveBeenCalled();
    expect(profile.sourcePreferenceAdjustments).toEqual(new Map());
    expect(profile.articleFeedback).toEqual(new Map());
  });
});
