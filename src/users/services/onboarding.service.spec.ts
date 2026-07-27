import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { UserLevel } from '../entities/user.entity';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';

describe('OnboardingService', () => {
  let service: OnboardingService;

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
  };

  const mockTechnologyInterestCommandService = {
    createOrReuse: jest.fn(),
  };

  const mockTechnologyInterestQueryService = {
    findSelectedByUser: jest.fn(),
  };

  const mockContentStreamQueryService = {
    findByIds: jest.fn(),
    findSelectedByUser: jest.fn(),
  };

  const mockContentStreamCommandService = {
    linkUserSelections: jest.fn(),
  };

  const mockFeedCacheInvalidationService = {
    invalidateForUser: jest.fn(),
  };

  const enabledStream = { id: 'cs-1', enabled: true };
  const dto = {
    level: UserLevel.MIDDLE,
    technologyInterests: [{ kind: TechnologyInterestKind.TECHNOLOGY, name: 'Node.js' }],
    contentStreamIds: ['cs-1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OnboardingService(
      mockUserRepo as any,
      mockTechnologyInterestCommandService as any,
      mockTechnologyInterestQueryService as any,
      mockContentStreamQueryService as any,
      mockContentStreamCommandService as any,
      mockFeedCacheInvalidationService as any,
    );
  });

  describe('completeOnboarding', () => {
    it('throws BadRequestException for an invalid user id', async () => {
      await expect(service.completeOnboarding('not-a-uuid', dto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.completeOnboarding(validId, dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('completes onboarding for the first time: resolves interests, links streams, sets level and onboardingCompletedAt', async () => {
      const user = { id: validId, level: null, onboardingCompletedAt: null };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockContentStreamQueryService.findByIds.mockResolvedValue([enabledStream]);

      const result = await service.completeOnboarding(validId, dto as any);

      expect(mockTechnologyInterestCommandService.createOrReuse).toHaveBeenCalledWith(
        validId,
        TechnologyInterestKind.TECHNOLOGY,
        'Node.js',
      );
      expect(mockContentStreamCommandService.linkUserSelections).toHaveBeenCalledWith(validId, [
        'cs-1',
      ]);
      expect(result.level).toBe(UserLevel.MIDDLE);
      expect(result.onboardingCompletedAt).toBeInstanceOf(Date);
      expect(mockFeedCacheInvalidationService.invalidateForUser).toHaveBeenCalledWith(validId);
    });

    it('is idempotent on re-call after completion: updates level/selections but never un-sets onboardingCompletedAt', async () => {
      const firstCompletedAt = new Date('2026-01-01T00:00:00.000Z');
      const user = {
        id: validId,
        level: UserLevel.JUNIOR,
        onboardingCompletedAt: firstCompletedAt,
      };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockContentStreamQueryService.findByIds.mockResolvedValue([enabledStream]);

      const result = await service.completeOnboarding(validId, {
        ...dto,
        level: UserLevel.SENIOR,
      } as any);

      expect(result.level).toBe(UserLevel.SENIOR);
      expect(result.onboardingCompletedAt).toBe(firstCompletedAt);
    });

    it('rejects an unknown content stream id before linking anything or resolving technology interests', async () => {
      const user = { id: validId, level: null, onboardingCompletedAt: null };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockContentStreamQueryService.findByIds.mockResolvedValue([]); // none found

      await expect(service.completeOnboarding(validId, dto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockContentStreamCommandService.linkUserSelections).not.toHaveBeenCalled();
      expect(mockTechnologyInterestCommandService.createOrReuse).not.toHaveBeenCalled();
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a disabled content stream id before linking anything or resolving technology interests', async () => {
      const user = { id: validId, level: null, onboardingCompletedAt: null };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockContentStreamQueryService.findByIds.mockResolvedValue([{ id: 'cs-1', enabled: false }]);

      await expect(service.completeOnboarding(validId, dto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockContentStreamCommandService.linkUserSelections).not.toHaveBeenCalled();
      expect(mockTechnologyInterestCommandService.createOrReuse).not.toHaveBeenCalled();
    });

    it('rejects an invalid content stream id for a new technology-interest submission without ever attempting to resolve/create that technology interest', async () => {
      const user = { id: validId, level: null, onboardingCompletedAt: null };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockContentStreamQueryService.findByIds.mockResolvedValue([]); // unknown content stream id

      const newTechDto = {
        level: UserLevel.MIDDLE,
        technologyInterests: [
          { kind: TechnologyInterestKind.TECHNOLOGY, name: 'Brand New Framework' },
        ],
        contentStreamIds: ['unknown-cs-id'],
      };

      await expect(service.completeOnboarding(validId, newTechDto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockTechnologyInterestCommandService.createOrReuse).not.toHaveBeenCalled();
      expect(mockContentStreamCommandService.linkUserSelections).not.toHaveBeenCalled();
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getUserTaxonomy', () => {
    it('returns the user level, selected technology interests, content streams, and completion timestamp', async () => {
      const completedAt = new Date('2026-01-01T00:00:00.000Z');
      const user = { id: validId, level: UserLevel.SENIOR, onboardingCompletedAt: completedAt };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockTechnologyInterestQueryService.findSelectedByUser.mockResolvedValue([
        {
          id: 'ti-1',
          kind: TechnologyInterestKind.TECHNOLOGY,
          name: 'Node.js',
          normalizedName: 'node.js',
          aliases: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockContentStreamQueryService.findSelectedByUser.mockResolvedValue([
        {
          id: 'cs-1',
          key: 'security',
          name: 'Security',
          description: null,
          sortOrder: 1,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.getUserTaxonomy(validId);

      expect(result.level).toBe(UserLevel.SENIOR);
      expect(result.onboardingCompletedAt).toBe(completedAt);
      expect(result.technologyInterests).toHaveLength(1);
      expect(result.contentStreams).toHaveLength(1);
    });
  });
});
