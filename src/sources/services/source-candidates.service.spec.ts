// jsdom/@mozilla/readability are mocked at the module boundary, same as
// content-extraction.service.spec.ts: jsdom v29's dependency tree is ESM-only several levels
// deep and isn't loadable under this project's Jest/ts-jest setup (pre-existing test-infra gap).
// SourceCandidatesService only calls ContentExtractionService.extract() through a mock anyway,
// so this doesn't reduce coverage here.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SourceCandidatesService } from './source-candidates.service';
import {
  SourceCandidate,
  SourceCandidateDetectedType,
  SourceCandidateStatus,
} from '../entities/source-candidate.entity';
import { SourceType } from '../entities/source.entity';
import { WebDiscoveryMethod } from '../entities/web-source-config.entity';

describe('SourceCandidatesService', () => {
  let service: SourceCandidatesService;

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  const mockCandidateRepo = {
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: Partial<SourceCandidate>) =>
      Promise.resolve({ id: validId, ...(data as object) }),
    ),
  };

  const mockSourceRepo = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const mockHttpService = {
    request: jest.fn(),
  };

  const mockSourceDiscoveryService = {
    discoverEntryPoints: jest.fn(),
  };

  const mockContentExtractionService = {
    extract: jest.fn(),
  };

  const mockArticlesService = {
    findByUrlHash: jest.fn().mockResolvedValue(null),
    create: jest.fn((data: unknown) =>
      Promise.resolve({ id: `article-${Math.random()}`, ...(data as object) }),
    ),
  };

  const mockAiAnalysisService = {
    preAnalyzeArticle: jest.fn(),
  };

  const mockManager = {
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((_entity: unknown, data: unknown) =>
      Promise.resolve({ id: 'source-1', ...(data as object) }),
    ),
  };

  const mockDataSource = {
    transaction: jest.fn((cb: (manager: unknown) => unknown) => cb(mockManager)),
  };

  const baseCandidate: SourceCandidate = {
    id: validId,
    normalizedUrl: 'https://example.com',
    domain: 'example.com',
    discoveredFromArticleId: null,
    discoveredFromArticle: null,
    seedKey: null,
    status: SourceCandidateStatus.PENDING,
    detectedType: null,
    proposedConfig: null,
    validationError: null,
    lastValidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as SourceCandidate;

  beforeEach(() => {
    jest.clearAllMocks();
    mockArticlesService.findByUrlHash.mockResolvedValue(null);
    mockCandidateRepo.findOne.mockResolvedValue({ ...baseCandidate });
    mockSourceRepo.findOne.mockResolvedValue(null);

    service = new SourceCandidatesService(
      mockCandidateRepo as any,
      mockSourceRepo as any,
      mockHttpService as any,
      mockSourceDiscoveryService as any,
      mockContentExtractionService as any,
      mockArticlesService as any,
      mockAiAnalysisService as any,
      mockDataSource as any,
    );
  });

  describe('create (idempotent upsert)', () => {
    it('creates a new candidate when none exists for the normalized URL', async () => {
      mockCandidateRepo.findOne.mockResolvedValue(null);

      const result = await service.create({ url: 'https://example.com/?utm_source=x' });

      expect(mockCandidateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizedUrl: 'https://example.com/',
          domain: 'example.com',
          status: SourceCandidateStatus.PENDING,
        }),
      );
      expect(result.normalizedUrl).toBe('https://example.com/');
    });

    it('updates the existing row instead of creating a duplicate when the normalized URL matches', async () => {
      const existing = { ...baseCandidate, normalizedUrl: 'https://example.com/' };
      mockCandidateRepo.findOne.mockResolvedValue(existing);

      const result = await service.create({
        url: 'https://example.com/?utm_source=x',
        proposedConfig: { name: 'Example' },
      });

      expect(mockCandidateRepo.create).not.toHaveBeenCalled();
      expect(mockCandidateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: validId,
          proposedConfig: { name: 'Example' },
          lastValidatedAt: expect.any(Date) as unknown as Date,
        }),
      );
      expect(result.id).toBe(validId);
    });
  });

  describe('reject', () => {
    it('sets status rejected with the given reason', async () => {
      const result = await service.reject(validId, 'Paywalled site');

      expect(mockCandidateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SourceCandidateStatus.REJECTED,
          validationError: 'Paywalled site',
        }),
      );
      expect(result.validationError).toBe('Paywalled site');
    });

    it('defaults the reason when none is given', async () => {
      await service.reject(validId);

      expect(mockCandidateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ validationError: 'Manually rejected' }),
      );
    });

    it('throws BadRequestException for an invalid ID', async () => {
      await expect(service.reject('not-a-uuid')).rejects.toThrow(BadRequestException);
      expect(mockCandidateRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the candidate does not exist', async () => {
      mockCandidateRepo.findOne.mockResolvedValue(null);
      await expect(service.reject(validId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('promote', () => {
    function mockSuccessfulDiscovery(
      entryUrls = ['https://example.com/post-1', 'https://example.com/post-2'],
    ) {
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.SITEMAP,
        entryUrls,
        confidence: 'high',
      });
    }

    function mockExtractionAndHttpForEachUrl() {
      mockHttpService.request.mockResolvedValue({
        status: 200,
        data: '<html></html>',
        headers: {},
      });
      mockContentExtractionService.extract.mockReturnValue({
        success: true,
        method: 'readability',
        title: 'A sampled article',
        content: 'body',
        textContent: 'body text',
      });
    }

    it('promotes the candidate when >= 2 sampled articles are relevant', async () => {
      mockSuccessfulDiscovery();
      mockExtractionAndHttpForEachUrl();
      mockAiAnalysisService.preAnalyzeArticle.mockResolvedValue({ preAnalysisIsRelevant: true });

      const result = await service.promote(validId);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ url: 'https://example.com', enabled: false }),
      );
      // Enabled only after promotion is confirmed.
      expect(mockSourceRepo.update).toHaveBeenCalledWith('source-1', { enabled: true });
      expect(mockSourceRepo.delete).not.toHaveBeenCalled();
      expect(result.status).toBe(SourceCandidateStatus.PROMOTED);
      expect(result.detectedType).toBe(SourceCandidateDetectedType.WEB);
      expect(result.validationError).toBeNull();
    });

    it('creates a WebSourceConfig alongside the Source when the detected type is web', async () => {
      mockSuccessfulDiscovery();
      mockExtractionAndHttpForEachUrl();
      mockAiAnalysisService.preAnalyzeArticle.mockResolvedValue({ preAnalysisIsRelevant: true });

      await service.promote(validId);

      expect(mockManager.save).toHaveBeenCalledTimes(2);
    });

    it('persists the candidate seed URL as WebSourceConfig.entryUrls, not discovery output', async () => {
      // Discovery's entryUrls are the individual article permalinks it found while sampling —
      // never the listing/seed URL the config should crawl from on replay.
      mockSuccessfulDiscovery(['https://example.com/post-1', 'https://example.com/post-2']);
      mockExtractionAndHttpForEachUrl();
      mockAiAnalysisService.preAnalyzeArticle.mockResolvedValue({ preAnalysisIsRelevant: true });

      await service.promote(validId);

      const webConfigSaveCall = mockManager.save.mock.calls[1];
      expect(webConfigSaveCall[1]).toEqual(
        expect.objectContaining({ entryUrls: ['https://example.com'] }),
      );
    });

    it('promotes an RSS-detected candidate with a captured feedUrl as a real rss Source, not web', async () => {
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.RSS,
        entryUrls: ['https://example.com/post-1', 'https://example.com/post-2'],
        feedUrl: 'https://example.com/feed.xml',
        confidence: 'high',
      });
      mockExtractionAndHttpForEachUrl();
      mockAiAnalysisService.preAnalyzeArticle.mockResolvedValue({ preAnalysisIsRelevant: true });

      const result = await service.promote(validId);

      // Only the Source is saved — no WebSourceConfig for a genuine feed-type Source.
      expect(mockManager.save).toHaveBeenCalledTimes(1);
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ url: 'https://example.com/feed.xml', type: SourceType.RSS }),
      );
      expect(result.detectedType).toBe(SourceCandidateDetectedType.RSS);
    });

    it('falls back to a web Source when RSS is detected but no feedUrl was captured', async () => {
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.RSS,
        entryUrls: ['https://example.com/post-1', 'https://example.com/post-2'],
        confidence: 'high',
      });
      mockExtractionAndHttpForEachUrl();
      mockAiAnalysisService.preAnalyzeArticle.mockResolvedValue({ preAnalysisIsRelevant: true });

      await service.promote(validId);

      expect(mockManager.save).toHaveBeenCalledTimes(2);
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ url: 'https://example.com', type: SourceType.WEB }),
      );
    });

    it('marks needs_review with a reason when fewer than 2 sampled articles are relevant', async () => {
      mockSuccessfulDiscovery();
      mockExtractionAndHttpForEachUrl();
      mockAiAnalysisService.preAnalyzeArticle.mockResolvedValue({ preAnalysisIsRelevant: false });

      const result = await service.promote(validId);

      expect(mockSourceRepo.update).not.toHaveBeenCalled();
      // Rolling back the provisional Source cascades away its WebSourceConfig and sample Articles.
      expect(mockSourceRepo.delete).toHaveBeenCalledWith('source-1');
      expect(result.status).toBe(SourceCandidateStatus.NEEDS_REVIEW);
      expect(result.validationError).toContain('0 of 2 sampled article(s)');
    });

    it('rejects outright when discovery itself fails, never creating a Source', async () => {
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'no usable sitemap or feed found',
      });

      const result = await service.promote(validId);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(result.status).toBe(SourceCandidateStatus.REJECTED);
      expect(result.validationError).toContain('no usable sitemap or feed found');
    });

    it('rejects outright when a Source for this URL already exists', async () => {
      mockSourceRepo.findOne.mockResolvedValue({
        id: 'existing-source',
        url: 'https://example.com',
      });

      const result = await service.promote(validId);

      expect(mockSourceDiscoveryService.discoverEntryPoints).not.toHaveBeenCalled();
      expect(result.status).toBe(SourceCandidateStatus.REJECTED);
      expect(result.validationError).toContain('already exists');
    });
  });
});
