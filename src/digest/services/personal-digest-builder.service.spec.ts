import { PersonalDigestBuilderService } from './personal-digest-builder.service';
import { DigestType, DigestStatus } from '../entities/digest.entity';
import { PersonalArticleLinkContext } from '../../user-actions/entities/personal-article-link.entity';

// Non-standard business logic — the test set below covers, per file scope:
// - candidate scoring/eligibility delegation to RelevanceScoringService
// - per-user dedup (getUsedArticleIds scoped by Digest.userId)
// - diversification cap enforcement
// - fallback-window widening when under target count
// - empty-after-fallback -> null, no Digest row, no email render
// - link-batch creation scoped to the final selected set only
// - per-item saveUrl population
// - feedback-button field entirely absent from rendered email items
describe('PersonalDigestBuilderService', () => {
  let service: PersonalDigestBuilderService;

  const user = { id: 'user-a', email: 'user-a@example.com' } as any;

  const analysisQb = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const digestItemQb = {
    select: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const mockAnalysisRepo = { createQueryBuilder: jest.fn(() => analysisQb) };
  const mockArticleStreamRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockArticleTechnologyInterestRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockDigestRepo = {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ ...x, id: 'digest-1' })),
  };
  const mockDigestItemRepo = {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve(x)),
    createQueryBuilder: jest.fn(() => digestItemQb),
  };
  const mockUserScoringProfileService = {
    buildProfile: jest.fn().mockResolvedValue({
      technologyInterestIds: [],
      contentStreamIds: [],
      level: null,
    }),
  };
  const mockRelevanceScoringService = { computeScore: jest.fn() };
  const mockPersonalArticleLinkService = {
    findOrCreateLinksBatch: jest.fn().mockResolvedValue(new Map()),
  };
  const mockSaveLinkSignatureService = {
    buildSaveFromEmailUrl: jest.fn(
      (userId: string, articleId: string) =>
        `https://app.example.com/articles/${articleId}/save-from-email?userId=${userId}&signature=sig`,
    ),
  };
  const mockAiDigestService = { generateIntro: jest.fn().mockResolvedValue('Intro text') };
  const mockEmailTemplateService = {
    renderHtml: jest.fn().mockReturnValue('<html></html>'),
    renderText: jest.fn().mockReturnValue('text'),
  };
  const mockTechnologyInterestQueryService = { findByIds: jest.fn().mockResolvedValue([]) };

  function makeAnalysis(id: string, overrides: Record<string, unknown> = {}) {
    return {
      articleId: id,
      qualityScore: 70,
      complexityLevel: null,
      shortSummary: `Summary ${id}`,
      whyItMatters: `Matters ${id}`,
      tags: [],
      article: {
        id,
        title: `Title ${id}`,
        url: `https://example.com/${id}`,
        sourceId: `source-${id}`,
        publishedAt: new Date(),
        source: { name: `Source ${id}`, category: `category-${id}` },
      },
      ...overrides,
    };
  }

  function eligibleResult(score: number) {
    return {
      eligible: true,
      score,
      breakdown: {
        techInterestOverlap: 0,
        complexityMatch: 0,
        qualityScore: 0,
        recencyScore: 0,
        sourcePreferenceAdjustment: 0,
        directFeedbackAdjustment: 0,
      },
    };
  }

  const ineligibleResult = {
    eligible: false,
    score: 0,
    breakdown: {
      techInterestOverlap: 0,
      complexityMatch: 0,
      qualityScore: 0,
      recencyScore: 0,
      sourcePreferenceAdjustment: 0,
      directFeedbackAdjustment: 0,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    analysisQb.getMany.mockReset();
    digestItemQb.getRawMany.mockResolvedValue([]);
    mockArticleStreamRepo.find.mockResolvedValue([]);
    mockArticleTechnologyInterestRepo.find.mockResolvedValue([]);
    mockUserScoringProfileService.buildProfile.mockResolvedValue({
      technologyInterestIds: [],
      contentStreamIds: [],
      level: null,
    });
    mockPersonalArticleLinkService.findOrCreateLinksBatch.mockResolvedValue(new Map());
    mockAiDigestService.generateIntro.mockResolvedValue('Intro text');
    mockEmailTemplateService.renderHtml.mockReturnValue('<html></html>');
    mockEmailTemplateService.renderText.mockReturnValue('text');

    service = new PersonalDigestBuilderService(
      mockAnalysisRepo as any,
      mockArticleStreamRepo as any,
      mockArticleTechnologyInterestRepo as any,
      mockDigestRepo as any,
      mockDigestItemRepo as any,
      mockUserScoringProfileService as any,
      mockRelevanceScoringService as any,
      mockPersonalArticleLinkService as any,
      mockSaveLinkSignatureService as any,
      mockAiDigestService as any,
      mockEmailTemplateService as any,
      mockTechnologyInterestQueryService as any,
    );
  });

  it('delegates eligibility to RelevanceScoringService and only persists eligible candidates', async () => {
    const c1 = makeAnalysis('a1');
    const c2 = makeAnalysis('a2');
    const c3 = makeAnalysis('a3');
    analysisQb.getMany.mockResolvedValue([c1, c2, c3]);

    mockRelevanceScoringService.computeScore.mockImplementation((candidate: any) => {
      if (candidate.analysis.articleId === 'a3') return ineligibleResult;
      return eligibleResult(candidate.analysis.articleId === 'a1' ? 90 : 80);
    });

    const digest = await service.buildForUser(user, DigestType.DAILY);

    expect(digest).not.toBeNull();
    const savedArticleIds = mockDigestItemRepo.save.mock.calls.map((c) => c[0].articleId);
    expect(savedArticleIds).toEqual(expect.arrayContaining(['a1', 'a2']));
    expect(savedArticleIds).not.toContain('a3');
  });

  it('scopes the used-article-id dedup query to the requesting user', async () => {
    analysisQb.getMany.mockResolvedValue([]);

    await service.buildForUser(user, DigestType.DAILY);

    expect(digestItemQb.where).toHaveBeenCalledWith('d.userId = :userId', { userId: user.id });
  });

  it('excludes articles already sent to this user from the candidate query', async () => {
    digestItemQb.getRawMany.mockResolvedValue([{ articleId: 'used-1' }]);
    analysisQb.getMany.mockResolvedValue([]);

    await service.buildForUser(user, DigestType.DAILY);

    expect(analysisQb.andWhere).toHaveBeenCalledWith('aa.articleId NOT IN (:...excludeIds)', {
      excludeIds: ['used-1'],
    });
  });

  it('caps the selected set at the configured article limit even with more eligible candidates', async () => {
    const candidates = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => makeAnalysis(id));
    analysisQb.getMany.mockResolvedValue(candidates);
    mockRelevanceScoringService.computeScore.mockImplementation((candidate: any) => {
      const score = { a1: 90, a2: 80, a3: 70, a4: 60, a5: 50 }[
        candidate.analysis.articleId as string
      ] as number;
      return eligibleResult(score);
    });

    await service.buildForUser(user, DigestType.DAILY);

    // DAILY_DIGEST_ARTICLES_LIMIT defaults to 3.
    expect(mockDigestItemRepo.save).toHaveBeenCalledTimes(3);
  });

  it('widens the lookback window when the first window is under the target count, and stops widening once satisfied', async () => {
    const c1 = makeAnalysis('a1');
    const c2 = makeAnalysis('a2');
    const c3 = makeAnalysis('a3');
    analysisQb.getMany.mockResolvedValueOnce([c1]).mockResolvedValueOnce([c1, c2, c3]);
    mockRelevanceScoringService.computeScore.mockImplementation((candidate: any) =>
      eligibleResult(candidate.analysis.articleId === 'a1' ? 90 : 80),
    );

    await service.buildForUser(user, DigestType.DAILY);

    // Third (widest) fallback window must never be queried once the second satisfies the cap.
    expect(analysisQb.getMany).toHaveBeenCalledTimes(2);
    expect(mockDigestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        buildDebug: expect.objectContaining({ fallbackUsed: true, finalWindowHours: 48 }),
      }),
    );
  });

  it('returns null with no Digest row and no email render when no candidates survive after fallback', async () => {
    analysisQb.getMany.mockResolvedValue([]);

    const digest = await service.buildForUser(user, DigestType.DAILY);

    expect(digest).toBeNull();
    expect(mockDigestRepo.save).not.toHaveBeenCalled();
    expect(mockEmailTemplateService.renderHtml).not.toHaveBeenCalled();
    expect(mockPersonalArticleLinkService.findOrCreateLinksBatch).not.toHaveBeenCalled();
  });

  it('creates personal article links only once, scoped to the final selected set (not the full eligible pool)', async () => {
    const candidates = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => makeAnalysis(id));
    analysisQb.getMany.mockResolvedValue(candidates);
    mockRelevanceScoringService.computeScore.mockImplementation((candidate: any) => {
      const score = { a1: 90, a2: 80, a3: 70, a4: 60, a5: 50 }[
        candidate.analysis.articleId as string
      ] as number;
      return eligibleResult(score);
    });

    await service.buildForUser(user, DigestType.DAILY);

    expect(mockPersonalArticleLinkService.findOrCreateLinksBatch).toHaveBeenCalledTimes(1);
    expect(mockPersonalArticleLinkService.findOrCreateLinksBatch).toHaveBeenCalledWith(
      user.id,
      ['a1', 'a2', 'a3'],
      PersonalArticleLinkContext.DAILY_DIGEST,
    );
  });

  it('populates a saveUrl on every rendered email item and never sets a feedback-button articleId field', async () => {
    const c1 = makeAnalysis('a1');
    analysisQb.getMany.mockResolvedValue([c1]);
    mockRelevanceScoringService.computeScore.mockReturnValue(eligibleResult(90));

    await service.buildForUser(user, DigestType.DAILY);

    expect(mockEmailTemplateService.renderHtml).toHaveBeenCalled();
    const items = mockEmailTemplateService.renderHtml.mock.calls[0][2];
    expect(items).toHaveLength(1);
    expect(items[0].saveUrl).toBe(
      'https://app.example.com/articles/a1/save-from-email?userId=user-a&signature=sig',
    );
    expect(items[0]).not.toHaveProperty('articleId');
  });

  it('saves the digest in DRAFT status against the requesting user', async () => {
    const c1 = makeAnalysis('a1');
    analysisQb.getMany.mockResolvedValue([c1]);
    mockRelevanceScoringService.computeScore.mockReturnValue(eligibleResult(90));

    await service.buildForUser(user, DigestType.DAILY);

    expect(mockDigestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        type: DigestType.DAILY,
        status: DigestStatus.DRAFT,
      }),
    );
  });
});
