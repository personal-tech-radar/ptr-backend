// jsdom/@mozilla/readability are mocked at the module boundary, same as
// content-extraction.service.spec.ts and source-candidates.service.spec.ts: jsdom v29's
// dependency tree is ESM-only several levels deep and isn't loadable under this project's
// Jest/ts-jest setup (pre-existing test-infra gap). SourceSyncService only reaches these
// transitively (via SourceCandidatesService's constructor type), never calls them directly.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { fetchAndValidateFeed } from '../../common/util/feed-validator.util';
import { SourceCandidateStatus } from '../entities/source-candidate.entity';
import { SourceCategory, SourceType } from '../entities/source.entity';
import {
  ManifestEntryV2,
  SourceSyncService,
  loadManifest,
  slugifySourceName,
} from './source-sync.service';

jest.mock('../../common/util/feed-validator.util');
const mockFetchAndValidateFeed = fetchAndValidateFeed as jest.MockedFunction<
  typeof fetchAndValidateFeed
>;

function rssEntry(overrides: Partial<ManifestEntryV2> = {}): ManifestEntryV2 {
  return {
    seedKey: 'example-feed',
    name: 'Example Feed',
    seedUrl: 'https://example.com/feed.xml',
    sourceType: SourceType.RSS,
    category: SourceCategory.BACKEND_ARCHITECTURE_INFRA,
    trustScore: 80,
    enabled: true,
    discovery: { mode: 'rss', entryUrls: ['https://example.com/feed.xml'], allowAiFallback: false },
    ...overrides,
  };
}

describe('loadManifest', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ptr-manifest-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads a v2 manifest from config/sources.manifest.json', () => {
    writeMainManifest(dir, {
      version: 2,
      sources: [rssEntry()],
    });

    const result = loadManifest(dir);

    expect(result.format).toBe('v2');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].seedKey).toBe('example-feed');
  });

  it('detects a bare legacy array at config/sources.manifest.json and converts each entry', () => {
    writeMainManifest(dir, [
      {
        name: 'InfoQ Architecture',
        url: 'https://feed.infoq.com/architecture',
        type: 'rss',
        category: 'backend_architecture_infra',
        enabled: true,
        trustScore: 82,
      },
    ]);

    const result = loadManifest(dir);

    expect(result.format).toBe('legacy');
    expect(result.entries).toEqual([
      {
        seedKey: 'infoq-architecture',
        name: 'InfoQ Architecture',
        seedUrl: 'https://feed.infoq.com/architecture',
        sourceType: 'rss',
        category: 'backend_architecture_infra',
        trustScore: 82,
        enabled: true,
        discovery: {
          mode: 'rss',
          entryUrls: ['https://feed.infoq.com/architecture'],
          allowAiFallback: false,
        },
      },
    ]);
  });

  it('falls back to the legacy config/sources.seed.json when the v2 file does not exist at all', () => {
    writeLegacySeedFile(dir, [
      {
        name: 'Cloudflare Blog',
        url: 'https://blog.cloudflare.com/rss/',
        type: 'rss',
        category: 'backend_architecture_infra',
        enabled: true,
        trustScore: 92,
      },
    ]);

    const result = loadManifest(dir);

    expect(result.format).toBe('legacy');
    expect(result.filePath).toContain('sources.seed.json');
    expect(result.entries[0].seedKey).toBe('cloudflare-blog');
  });

  it('throws when neither file exists', () => {
    expect(() => loadManifest(dir)).toThrow(/No source manifest found/);
  });
});

describe('slugifySourceName', () => {
  it('produces a stable, URL-safe slug', () => {
    expect(slugifySourceName('InfoQ Architecture')).toBe('infoq-architecture');
    expect(slugifySourceName('Node.js Releases')).toBe('node-js-releases');
    expect(slugifySourceName('Microservices.io')).toBe('microservices-io');
  });
});

describe('SourceSyncService', () => {
  let service: SourceSyncService;

  const mockSourceRepo = {
    find: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockSourceCandidateRepo = {
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockSourcesService = {
    create: jest.fn(),
    createOrReuse: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockSourceCandidatesService = {
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSourceRepo.find.mockResolvedValue([]);
    mockSourcesService.createOrReuse.mockResolvedValue({ id: 'new-source-id' });
    mockSourceCandidatesService.create.mockResolvedValue({ id: 'candidate-1' });
    mockFetchAndValidateFeed.mockResolvedValue({ ok: true, rawText: '<rss></rss>' } as any);

    service = new SourceSyncService(
      mockSourceRepo as any,
      mockSourceCandidateRepo as any,
      mockSourcesService as any,
      mockSourceCandidatesService as any,
    );
  });

  describe('idempotency', () => {
    it('creates a Source on the first run, then only updates (no duplicate create) on the second run', async () => {
      const entry = rssEntry();

      // First run: nothing exists yet.
      mockSourceRepo.find.mockResolvedValue([]);
      const firstSummary = await service.syncAll([entry]);
      expect(firstSummary.created).toEqual(['example-feed']);
      expect(mockSourcesService.createOrReuse).toHaveBeenCalledTimes(1);

      // Second run: the row created above now exists, matched by normalized URL.
      jest.clearAllMocks();
      mockSourceRepo.find.mockResolvedValue([
        { id: 'existing-id', url: entry.seedUrl, enabled: true, trustScore: 80 },
      ]);

      const secondSummary = await service.syncAll([entry]);

      expect(secondSummary.updated).toEqual(['example-feed']);
      expect(mockSourcesService.createOrReuse).not.toHaveBeenCalled();
      expect(mockSourcesService.update).toHaveBeenCalledTimes(1);
    });

    it('without --force, a re-run leaves enabled/trustScore untouched even when the manifest has different values', async () => {
      const entry = rssEntry({ enabled: false, trustScore: 10 });
      mockSourceRepo.find.mockResolvedValue([
        { id: 'existing-id', url: entry.seedUrl, enabled: true, trustScore: 80 },
      ]);

      await service.syncAll([entry]);

      expect(mockSourcesService.update).toHaveBeenCalledWith('existing-id', {
        name: entry.name,
        category: entry.category,
        url: entry.seedUrl,
      });
    });
  });

  describe('--force overwrite path', () => {
    it('syncs enabled/trustScore onto an existing Source when --force is passed', async () => {
      const entry = rssEntry({ enabled: false, trustScore: 10 });
      mockSourceRepo.find.mockResolvedValue([
        { id: 'existing-id', url: entry.seedUrl, enabled: true, trustScore: 80 },
      ]);

      await service.syncAll([entry], { force: true });

      expect(mockSourcesService.update).toHaveBeenCalledWith('existing-id', {
        name: entry.name,
        category: entry.category,
        url: entry.seedUrl,
        enabled: false,
        trustScore: 10,
      });
    });
  });

  describe('continue-on-error', () => {
    it('does not stop the rest of the run when one entry throws unexpectedly', async () => {
      const entries = [
        rssEntry({ seedKey: 'first', seedUrl: 'https://example.com/first.xml' }),
        rssEntry({ seedKey: 'second', seedUrl: 'https://example.com/second.xml' }),
        rssEntry({ seedKey: 'third', seedUrl: 'https://example.com/third.xml' }),
      ];
      mockSourceRepo.find.mockResolvedValue([]);
      mockSourcesService.createOrReuse.mockImplementation((dto: any) => {
        if (dto.url === 'https://example.com/second.xml') {
          return Promise.reject(new Error('unexpected DB error'));
        }
        return Promise.resolve({ id: `source-${dto.url}` });
      });

      const summary = await service.syncAll(entries);

      expect(summary.created.sort()).toEqual(['first', 'third']);
      expect(summary.failed).toEqual([{ seedKey: 'second', reason: 'unexpected DB error' }]);
      // All three were still attempted — the failure of #2 didn't short-circuit #3.
      expect(mockSourcesService.createOrReuse).toHaveBeenCalledTimes(3);
    });
  });

  describe('discovery failure -> SourceCandidate (not a run failure)', () => {
    it('creates a needs_review SourceCandidate via SourceCandidatesService.create when no feed is found', async () => {
      const entry = rssEntry();
      mockFetchAndValidateFeed.mockResolvedValue({ ok: false, message: 'HTTP 404' } as any);

      const summary = await service.syncAll([entry]);

      expect(summary.created).toEqual([]);
      expect(summary.failed).toEqual([]);
      expect(summary.candidatesCreated).toEqual(['example-feed']);
      expect(mockSourceCandidatesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: entry.seedUrl, seedKey: entry.seedKey }),
      );
      expect(mockSourceCandidateRepo.update).toHaveBeenCalledWith('candidate-1', {
        status: SourceCandidateStatus.REJECTED,
        validationError: expect.stringContaining('HTTP 404'),
      });
    });

    it('creates a needs_review SourceCandidate when web-mode discovery fails via SourcesService.create', async () => {
      const entry = rssEntry({
        discovery: { mode: 'web', entryUrls: ['https://example.com'], allowAiFallback: false },
      });
      mockSourcesService.createOrReuse.mockRejectedValue(
        new BadRequestException('Could not discover a working entry point'),
      );

      const summary = await service.syncAll([entry]);

      expect(summary.candidatesCreated).toEqual(['example-feed']);
      expect(summary.failed).toEqual([]);
    });

    it('re-throws (and lets the entry land in `failed`) a non-BadRequestException error from web-mode creation', async () => {
      const entry = rssEntry({
        discovery: { mode: 'web', entryUrls: ['https://example.com'], allowAiFallback: false },
      });
      mockSourcesService.createOrReuse.mockRejectedValue(
        new ConflictException('Source already exists'),
      );

      const summary = await service.syncAll([entry]);

      expect(summary.failed).toEqual([
        { seedKey: 'example-feed', reason: 'Source already exists' },
      ]);
      expect(summary.candidatesCreated).toEqual([]);
    });
  });

  describe('sourceType handling for feed-mode entries', () => {
    it('uses the manifest sourceType directly (e.g. github_release) rather than sniffing it', async () => {
      const entry = rssEntry({ sourceType: SourceType.GITHUB_RELEASE });

      await service.syncAll([entry]);

      expect(mockSourcesService.createOrReuse).toHaveBeenCalledWith(
        expect.objectContaining({ type: SourceType.GITHUB_RELEASE }),
      );
    });
  });

  describe('manifest entry validation', () => {
    it('rejects a trustScore outside 0-100 instead of forwarding it to SourcesService.create', async () => {
      const entry = rssEntry({ trustScore: 150 });

      const summary = await service.syncAll([entry]);

      expect(summary.failed).toEqual([
        {
          seedKey: 'example-feed',
          reason: expect.stringContaining('trustScore must be a number between 0 and 100'),
        },
      ]);
      expect(mockSourcesService.createOrReuse).not.toHaveBeenCalled();
    });

    it('rejects an invalid category before ever calling SourcesService.create', async () => {
      const entry = rssEntry({ category: 'not_a_real_category' as SourceCategory });

      const summary = await service.syncAll([entry]);

      expect(summary.failed).toEqual([
        {
          seedKey: 'example-feed',
          reason: expect.stringContaining('is not a valid SourceCategory'),
        },
      ]);
      expect(mockSourcesService.createOrReuse).not.toHaveBeenCalled();
    });

    it('rejects an entry missing its discovery config', async () => {
      const entry = rssEntry({ discovery: undefined as any });

      const summary = await service.syncAll([entry]);

      expect(summary.failed).toEqual([
        {
          seedKey: 'example-feed',
          reason: expect.stringContaining('discovery config is required'),
        },
      ]);
      expect(mockSourcesService.createOrReuse).not.toHaveBeenCalled();
    });
  });
});

function writeMainManifest(dir: string, content: unknown): void {
  mkdirSync(path.join(dir, 'config'), { recursive: true });
  writeFileSync(path.join(dir, 'config', 'sources.manifest.json'), JSON.stringify(content));
}

function writeLegacySeedFile(dir: string, content: unknown): void {
  mkdirSync(path.join(dir, 'config'), { recursive: true });
  writeFileSync(path.join(dir, 'config', 'sources.seed.json'), JSON.stringify(content));
}
