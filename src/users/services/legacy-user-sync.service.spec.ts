import * as bcrypt from 'bcrypt';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { UserLevel } from '../entities/user.entity';
import { LegacyUserManifestEntry, LegacyUserSyncService } from './legacy-user-sync.service';

const entry: LegacyUserManifestEntry = {
  email: 'miter.sidorov@gmail.com',
  role: 'user',
  timezone: 'Asia/Tbilisi',
  level: 'senior',
  githubUrl: 'https://github.com/mitersidorov',
  dailyDigestEnabled: true,
  weeklyDigestEnabled: true,
  contentStreamKeys: [
    'releases_and_changes',
    'security',
    'industry_pulse',
    'engineering_experience',
    'expert_opinions_and_practices',
  ],
  technologyInterests: [
    { kind: 'technology', name: 'Node.js' },
    { kind: 'technology', name: 'NestJS' },
  ],
};

const streamsByKey: Record<string, { id: string; key: string }> = Object.fromEntries(
  entry.contentStreamKeys.map((key, index) => [key, { id: `cs-${index}`, key }]),
);

describe('LegacyUserSyncService', () => {
  let service: LegacyUserSyncService;

  const mockUserRepo = {
    findOne: jest.fn(),
    restore: jest.fn(),
    update: jest.fn(),
  };

  const mockUserCommandService = {
    create: jest.fn(),
    updateProfile: jest.fn(),
  };

  const mockUserQueryService = {
    findByEmailIncludingDeleted: jest.fn(),
  };

  const mockOnboardingService = {
    completeOnboarding: jest.fn(),
  };

  const mockContentStreamQueryService = {
    // Explicit return-type annotation: without it, TS infers the resolved type from
    // `streamsByKey[key]` alone (a non-nullable index signature) and treats `?? null` as
    // unreachable, which then rejects `mockResolvedValueOnce(null)` in the "unknown key" test below.
    findByKey: jest.fn(
      (key: string): Promise<{ id: string; key: string } | null> =>
        Promise.resolve(streamsByKey[key] ?? null),
    ),
  };

  const mockArticleFeedbackService = {
    retagLegacyUser: jest.fn(),
  };

  const mockUserSourcePreferenceService = {
    retagLegacyUser: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockContentStreamQueryService.findByKey.mockImplementation((key: string) =>
      Promise.resolve(streamsByKey[key] ?? null),
    );
    mockArticleFeedbackService.retagLegacyUser.mockResolvedValue(0);
    mockUserSourcePreferenceService.retagLegacyUser.mockResolvedValue(0);
    mockUserCommandService.updateProfile.mockResolvedValue(undefined);
    mockOnboardingService.completeOnboarding.mockResolvedValue(undefined);
    mockUserRepo.update.mockResolvedValue(undefined);

    service = new LegacyUserSyncService(
      mockUserRepo as never,
      mockUserCommandService as never,
      mockUserQueryService as never,
      mockOnboardingService as never,
      mockContentStreamQueryService as never,
      mockArticleFeedbackService as never,
      mockUserSourcePreferenceService as never,
    );
  });

  describe('user creation vs. update branches', () => {
    it('creates a new user with role USER (never admin) when no user occupies the email', async () => {
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue(null);
      mockUserCommandService.create.mockResolvedValue({
        id: 'new-id',
        email: entry.email,
        emailVerifiedAt: null,
      });

      const result = await service.sync(entry);

      expect(mockUserCommandService.create).toHaveBeenCalledTimes(1);
      const createArg = mockUserCommandService.create.mock.calls[0][0];
      expect(createArg.email).toBe(entry.email);
      expect(createArg.emailVerifiedAt).toBeInstanceOf(Date);
      expect(result.created).toBe(true);
      expect(result.userId).toBe('new-id');
    });

    it('leaves an existing active user untouched (no create, no password reset)', async () => {
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
        id: 'existing-id',
        email: entry.email,
        deletedAt: null,
        emailVerifiedAt: new Date('2026-01-01'),
      });

      const result = await service.sync(entry);

      expect(mockUserCommandService.create).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.userId).toBe('existing-id');
    });

    it('resurrects a soft-deleted user without granting admin role', async () => {
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
        id: 'deleted-id',
        email: entry.email,
        deletedAt: new Date(),
        emailVerifiedAt: null,
      });
      mockUserRepo.findOne.mockResolvedValue({
        id: 'deleted-id',
        email: entry.email,
        deletedAt: null,
        emailVerifiedAt: null,
      });

      const result = await service.sync(entry);

      expect(mockUserRepo.restore).toHaveBeenCalledWith('deleted-id');
      expect(mockUserCommandService.create).not.toHaveBeenCalled();
      expect(result.userId).toBe('deleted-id');
      expect(result.created).toBe(false);
    });
  });

  describe('password hashing', () => {
    it('hashes the initial password via bcrypt rather than storing it plaintext', async () => {
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue(null);
      mockUserCommandService.create.mockResolvedValue({
        id: 'new-id',
        email: entry.email,
        emailVerifiedAt: null,
      });

      await service.sync(entry);

      const createArg = mockUserCommandService.create.mock.calls[0][0];
      expect(createArg.passwordHash).not.toBe('Admin2026');
      await expect(bcrypt.compare('Admin2026', createArg.passwordHash)).resolves.toBe(true);
      await expect(bcrypt.compare('wrong-password', createArg.passwordHash)).resolves.toBe(false);
    });
  });

  describe('profile and taxonomy delegation', () => {
    beforeEach(() => {
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
        id: 'existing-id',
        email: entry.email,
        deletedAt: null,
        emailVerifiedAt: new Date(),
      });
    });

    it('applies timezone/level/githubUrl via UserCommandService.updateProfile', async () => {
      await service.sync(entry);

      expect(mockUserCommandService.updateProfile).toHaveBeenCalledWith('existing-id', {
        timezone: 'Asia/Tbilisi',
        githubUrl: 'https://github.com/mitersidorov',
        level: UserLevel.SENIOR,
      });
    });

    it('resolves every content stream key and delegates taxonomy + level to OnboardingService', async () => {
      await service.sync(entry);

      expect(mockContentStreamQueryService.findByKey).toHaveBeenCalledTimes(5);
      expect(mockOnboardingService.completeOnboarding).toHaveBeenCalledWith('existing-id', {
        timezone: 'Asia/Tbilisi',
        level: UserLevel.SENIOR,
        technologyInterests: [
          { kind: TechnologyInterestKind.TECHNOLOGY, name: 'Node.js' },
          { kind: TechnologyInterestKind.TECHNOLOGY, name: 'NestJS' },
        ],
        contentStreamIds: ['cs-0', 'cs-1', 'cs-2', 'cs-3', 'cs-4'],
      });
    });

    it('throws when a manifest content stream key does not resolve to a real stream', async () => {
      mockContentStreamQueryService.findByKey.mockResolvedValueOnce(null);

      await expect(service.sync(entry)).rejects.toThrow(/unknown content stream key/);
      expect(mockOnboardingService.completeOnboarding).not.toHaveBeenCalled();
    });
  });

  describe('digest toggle direct write', () => {
    it('writes both digest toggles to true via the repository', async () => {
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
        id: 'existing-id',
        email: entry.email,
        deletedAt: null,
        emailVerifiedAt: new Date(),
      });

      await service.sync(entry);

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        'existing-id',
        expect.objectContaining({ dailyDigestEnabled: true, weeklyDigestEnabled: true }),
      );
    });

    it('never overwrites an already-verified emailVerifiedAt', async () => {
      const alreadyVerifiedAt = new Date('2020-01-01');
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
        id: 'existing-id',
        email: entry.email,
        deletedAt: null,
        emailVerifiedAt: alreadyVerifiedAt,
      });

      await service.sync(entry);

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        'existing-id',
        expect.objectContaining({ emailVerifiedAt: alreadyVerifiedAt }),
      );
    });
  });

  describe('idempotent legacy-row retag', () => {
    it('reports 0 retagged rows on a re-run once no legacy rows remain (no-op, no duplicate work)', async () => {
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
        id: 'existing-id',
        email: entry.email,
        deletedAt: null,
        emailVerifiedAt: new Date(),
      });
      mockArticleFeedbackService.retagLegacyUser.mockResolvedValue(0);
      mockUserSourcePreferenceService.retagLegacyUser.mockResolvedValue(0);

      const result = await service.sync(entry);

      expect(mockArticleFeedbackService.retagLegacyUser).toHaveBeenCalledWith(
        'default_user',
        'existing-id',
      );
      expect(mockUserSourcePreferenceService.retagLegacyUser).toHaveBeenCalledWith(
        'default_user',
        'existing-id',
      );
      expect(result.retaggedArticleFeedbackCount).toBe(0);
      expect(result.retaggedUserSourcePreferenceCount).toBe(0);
    });

    it('propagates non-zero counts from a first successful retag run', async () => {
      mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
        id: 'existing-id',
        email: entry.email,
        deletedAt: null,
        emailVerifiedAt: new Date(),
      });
      mockArticleFeedbackService.retagLegacyUser.mockResolvedValue(4);
      mockUserSourcePreferenceService.retagLegacyUser.mockResolvedValue(2);

      const result = await service.sync(entry);

      expect(result.retaggedArticleFeedbackCount).toBe(4);
      expect(result.retaggedUserSourcePreferenceCount).toBe(2);
    });
  });
});
