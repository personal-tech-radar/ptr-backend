import { Test, TestingModule } from '@nestjs/testing';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { UserLevel } from '../../users/entities/user.entity';
import { UserQueryService } from '../../users/services/user-query.service';
import { UserScoringProfileService } from './user-scoring-profile.service';

describe('UserScoringProfileService', () => {
  let service: UserScoringProfileService;

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
    const profile = await service.buildProfile(userId, ['src-1']);

    expect(profile).toEqual({
      technologyInterestIds: ['ti-1', 'ti-2'],
      technologyIds: [],
      interestIds: [],
      contentStreamIds: ['stream-1'],
      level: UserLevel.SENIOR,
      sourcePreferenceAdjustments: new Map([['src-1', 4]]),
    });
  });

  it('returns empty arrays with no crash for a pre-onboarding user with no selections', async () => {
    mockTechnologyInterestQueryService.findSelectedByUser.mockResolvedValue([]);
    mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([]);
    mockUserQueryService.findById.mockResolvedValue({ id: userId, level: null });
    mockUserSourcePreferenceService.getAdjustmentsForSources.mockResolvedValue(new Map());
    const profile = await service.buildProfile(userId, []);

    expect(profile.technologyInterestIds).toEqual([]);
    expect(profile.contentStreamIds).toEqual([]);
    expect(profile.level).toBeNull();
  });

  it('returns an empty source-adjustment map when candidate source IDs are empty', async () => {
    mockTechnologyInterestQueryService.findSelectedByUser.mockResolvedValue([]);
    mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([]);
    mockUserQueryService.findById.mockResolvedValue({ id: userId, level: null });
    mockUserSourcePreferenceService.getAdjustmentsForSources.mockResolvedValue(new Map());

    const profile = await service.buildProfile(userId, []);

    expect(profile.sourcePreferenceAdjustments).toEqual(new Map());
  });
});
