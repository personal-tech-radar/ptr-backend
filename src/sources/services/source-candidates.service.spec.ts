import { SourceCandidateStatus, SourceDiscoveryOrigin } from '../entities/source-candidate.entity';
import { SourceCandidatesService } from './source-candidates.service';
import { WebDiscoveryMethod } from '../entities/web-source-config.entity';

describe('SourceCandidatesService', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve({ id: 'candidate', ...value })),
  };
  let service: SourceCandidatesService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue(null);
    service = new SourceCandidatesService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('persists a shared pending candidate with its discovery provenance', async () => {
    const result = await service.create({
      url: 'https://Example.com/feed/',
      origin: SourceDiscoveryOrigin.TECHNOLOGY,
      technologyInterestId: 'taxonomy',
      contentStreamId: 'stream',
    });
    expect(result.status).toBe(SourceCandidateStatus.PENDING);
    expect(result.origin).toBe(SourceDiscoveryOrigin.TECHNOLOGY);
    expect(result.normalizedUrl).toBe('https://example.com/feed');
  });

  it('reuses an existing normalized candidate instead of creating duplicate work', async () => {
    const existing = {
      id: 'existing',
      normalizedUrl: 'https://example.com/feed',
      status: SourceCandidateStatus.REJECTED,
    };
    repo.findOne.mockResolvedValue(existing);
    await expect(service.create({ url: 'https://example.com/feed/' })).resolves.toMatchObject({
      id: 'existing',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('attaches provenance to a concurrently created source without leaving sample articles', async () => {
    const candidateId = '11111111-1111-4111-8111-111111111111';
    const candidate = {
      id: candidateId,
      normalizedUrl: 'https://example.com/feed',
      technologyInterestId: 'taxonomy',
      contentStreamId: 'stream',
      proposedConfig: null,
    };
    const candidateRepo = {
      findOne: jest.fn().mockResolvedValue(candidate),
      save: jest.fn(async (value) => value),
    };
    const coverageRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const articles = { create: jest.fn(), deleteByIds: jest.fn() };
    const identity = {
      findEquivalent: jest.fn().mockResolvedValue(null),
      resolveOrCreate: jest.fn().mockResolvedValue({
        source: { id: 'winning-source', enabled: true },
        created: false,
      }),
    };
    const raceService = new SourceCandidatesService(
      candidateRepo as never,
      {} as never,
      coverageRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {
        discoverEntryPoints: jest.fn().mockResolvedValue({
          success: true,
          method: WebDiscoveryMethod.RSS,
          feedUrl: 'https://example.com/feed',
          entryUrls: ['https://example.com/article'],
        }),
      } as never,
      {} as never,
      articles as never,
      {} as never,
      identity as never,
      {} as never,
    );

    const result = await raceService.promote(candidateId);

    expect(result).toMatchObject({
      status: SourceCandidateStatus.ACTIVE,
      activatedSourceId: 'winning-source',
    });
    expect(coverageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'winning-source', technologyInterestId: 'taxonomy' }),
    );
    expect(articles.create).not.toHaveBeenCalled();
    expect(articles.deleteByIds).not.toHaveBeenCalled();
  });

  it('cleans its own interrupted provisional source before retrying validation', async () => {
    const candidateId = '22222222-2222-4222-8222-222222222222';
    const candidate = {
      id: candidateId,
      normalizedUrl: 'https://example.com/feed',
      proposedConfig: { provisionalSourceId: 'provisional-source' },
    };
    const candidateRepo = {
      findOne: jest.fn().mockResolvedValue(candidate),
      save: jest.fn(async (value) => value),
    };
    const sourceRepo = { delete: jest.fn() };
    const retryService = new SourceCandidatesService(
      candidateRepo as never,
      sourceRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        discoverEntryPoints: jest.fn().mockResolvedValue({
          success: false,
          entryUrls: [],
          reason: 'unavailable',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findEquivalent: jest.fn().mockResolvedValue({ id: 'provisional-source' }),
      } as never,
      { increment: jest.fn() } as never,
    );

    const result = await retryService.promote(candidateId);

    expect(sourceRepo.delete).toHaveBeenCalledWith('provisional-source');
    expect(result.status).toBe(SourceCandidateStatus.REJECTED);
    expect(result.proposedConfig).not.toHaveProperty('provisionalSourceId');
  });
});
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));
