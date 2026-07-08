import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { fetchAndValidateFeed } from '../../common/util/feed-validator.util';
import { normalizeUrl } from '../../common/util/url-normalize.util';
import { UpdateSourceDto } from '../dto/update-source.dto';
import { SourceCandidate, SourceCandidateStatus } from '../entities/source-candidate.entity';
import { Source, SourceCategory, SourceType } from '../entities/source.entity';
import { CreateSourceCandidateInput, SourceCandidatesService } from './source-candidates.service';
import { SourcesService } from './sources.service';

export type ManifestDiscoveryMode = 'auto' | 'rss' | 'web';

export interface ManifestDiscoveryConfig {
  mode: ManifestDiscoveryMode;
  entryUrls?: string[];
  // Per-entry intent only — see the module comment above SourceSyncService.createWebModeSource
  // for why this can't currently override the process-wide AI-fallback kill switch.
  allowAiFallback?: boolean;
  allowedPathPatterns?: string[];
  articleLinkSelector?: string;
}

export interface ManifestEntryV2 {
  seedKey: string;
  name: string;
  seedUrl: string;
  // Optional, and only meaningful for discovery.mode === 'rss': disambiguates rss/atom/
  // github_release, which all resolve to the same discovery strategy ("require a working feed
  // at seedUrl") but must still persist as the correct SourceType. Not part of the v2 shape
  // sketched in the phase plan — see the judgment-call comment above SourceSyncService for why
  // it was added. Ignored for 'auto'/'web': those modes derive the real SourceType from whatever
  // discovery actually finds, never from this field.
  sourceType?: SourceType;
  category: SourceCategory;
  trustScore: number;
  enabled: boolean;
  discovery: ManifestDiscoveryConfig;
}

export interface ManifestV2Shape {
  version: 2;
  sources: ManifestEntryV2[];
}

export interface LegacySeedEntry {
  name: string;
  url: string;
  type: SourceType;
  category: SourceCategory;
  enabled?: boolean;
  trustScore?: number;
}

export interface LoadedManifest {
  filePath: string;
  format: 'v2' | 'legacy';
  entries: ManifestEntryV2[];
}

export interface SyncSummary {
  created: string[];
  updated: string[];
  candidatesCreated: string[];
  failed: { seedKey: string; reason: string }[];
}

/**
 * Resolves and loads the source manifest.
 *
 * File resolution (the "match by normalized URL, support legacy during migration" judgment call
 * documented in full on SourceSyncService below):
 *   1. `config/sources.manifest.json` — the v2 default. If present, its parsed shape decides how
 *      it's read: `{ version: 2, sources: [...] }` is read as v2; a bare JSON array is read as
 *      the legacy shape (covers a project that renamed the file but hasn't converted its
 *      contents yet).
 *   2. `config/sources.seed.json` — only consulted when (1) doesn't exist at all, so an
 *      environment that hasn't renamed its file yet still syncs instead of failing outright.
 *      Always treated as the legacy bare-array shape.
 *
 * This fallback exists purely for the phase 5 migration window and can be deleted once every
 * deployed environment has synced from a v2 manifest at least once.
 */
export function loadManifest(cwd: string = process.cwd()): LoadedManifest {
  const manifestPath = path.join(cwd, 'config', 'sources.manifest.json');
  if (existsSync(manifestPath)) {
    return parseManifestFile(manifestPath);
  }

  const legacyPath = path.join(cwd, 'config', 'sources.seed.json');
  if (existsSync(legacyPath)) {
    console.warn(
      `${manifestPath} not found; falling back to legacy ${legacyPath}. Rename it to ` +
        'config/sources.manifest.json and convert it to the v2 shape — this fallback is for the ' +
        'migration window only.',
    );
    return parseManifestFile(legacyPath);
  }

  throw new Error(`No source manifest found at ${manifestPath} or legacy ${legacyPath}`);
}

function parseManifestFile(filePath: string): LoadedManifest {
  const raw = readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return { filePath, format: 'legacy', entries: parsed.map(fromLegacyEntry) };
  }

  if (isV2ManifestShape(parsed)) {
    return { filePath, format: 'v2', entries: parsed.sources };
  }

  throw new Error(
    `${filePath} is neither a v2 manifest ({ version: 2, sources: [...] }) nor a legacy array`,
  );
}

function isV2ManifestShape(parsed: unknown): parsed is ManifestV2Shape {
  return (
    !!parsed &&
    typeof parsed === 'object' &&
    (parsed as Record<string, unknown>)['version'] === 2 &&
    Array.isArray((parsed as Record<string, unknown>)['sources'])
  );
}

function fromLegacyEntry(entry: LegacySeedEntry): ManifestEntryV2 {
  return {
    seedKey: slugifySourceName(entry.name),
    name: entry.name,
    seedUrl: entry.url,
    sourceType: entry.type,
    category: entry.category,
    trustScore: entry.trustScore ?? 50,
    enabled: entry.enabled ?? true,
    discovery: { mode: 'rss', entryUrls: [entry.url], allowAiFallback: false },
  };
}

export function slugifySourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CreateOutcome {
  ok: boolean;
  reason?: string;
}

const DISCOVERY_MODES: ManifestDiscoveryMode[] = ['auto', 'rss', 'web'];

// isV2ManifestShape only confirms the top-level { version, sources: [...] } envelope — it says
// nothing about whether each entry actually has the fields SourceSyncService assumes. Without this
// check, a malformed entry (missing discovery, an out-of-range trustScore, an invalid category)
// would either throw a cryptic TypeError deep in resolveAndCreate or — worse, for fields
// CreateSourceDto normally validates via the global ValidationPipe — sail straight through, since
// this sync path builds the DTO by hand and calls SourcesService.create() directly, never through
// the HTTP layer that would otherwise enforce those decorators. Validating each entry up front, per
// entry, gives a clear and specific error instead, and still lets the per-entry try/catch in
// syncAll route it to `failed` without aborting the rest of the run.
export function validateManifestEntry(entry: ManifestEntryV2): void {
  const label = entry?.seedKey || entry?.name || '(unidentified entry)';
  const fail = (message: string): never => {
    throw new Error(`Manifest entry "${label}": ${message}`);
  };

  if (!entry || typeof entry !== 'object') fail('entry is not an object');
  if (!entry.seedKey || typeof entry.seedKey !== 'string')
    fail('seedKey is required and must be a string');
  if (!entry.name || typeof entry.name !== 'string') fail('name is required and must be a string');
  if (!entry.seedUrl || typeof entry.seedUrl !== 'string')
    fail('seedUrl is required and must be a string');
  if (!Object.values(SourceCategory).includes(entry.category)) {
    fail(`category "${String(entry.category)}" is not a valid SourceCategory`);
  }
  if (
    typeof entry.trustScore !== 'number' ||
    !Number.isFinite(entry.trustScore) ||
    entry.trustScore < 0 ||
    entry.trustScore > 100
  ) {
    fail(`trustScore must be a number between 0 and 100, got ${String(entry.trustScore)}`);
  }
  if (typeof entry.enabled !== 'boolean') fail('enabled is required and must be a boolean');
  if (!entry.discovery || typeof entry.discovery !== 'object') {
    fail('discovery config is required');
  }
  if (!DISCOVERY_MODES.includes(entry.discovery.mode)) {
    fail(
      `discovery.mode "${String(entry.discovery?.mode)}" must be one of ${DISCOVERY_MODES.join(', ')}`,
    );
  }
  if (entry.sourceType !== undefined && !Object.values(SourceType).includes(entry.sourceType)) {
    fail(`sourceType "${String(entry.sourceType)}" is not a valid SourceType`);
  }
}

/**
 * Syncs `Source`/`SourceCandidate` rows from the seed manifest (`config/sources.manifest.json`).
 * Invoked by `src/seeds/sync-sources.ts`, the CLI entrypoint that resolves this service from a
 * bootstrapped Nest application context.
 *
 * Matching judgment call — normalized URL, not a `seedKey` column: this phase was scoped as "no
 * new migration needed." `Source` has no `seedKey` column today, and adding one is exactly the
 * kind of schema change that scoping ruled out. Since `Source.url` already carries a unique
 * constraint and every manifest entry's identity is really "the URL it resolves to," matching
 * existing rows by `normalizeUrl(source.url) === normalizeUrl(entry.seedUrl)` (the same
 * normalization `SourceCandidatesService`/`SourceDiscoveryService` already use) needs no schema
 * change at all. The manifest's `seedKey` is carried through to `SourceCandidate.seedKey`
 * (a column that *does* already exist) as an informational/promotion-tracking hint, but it is
 * never the sync's matching key for `Source` rows.
 *
 * Known limitation this implies: if an entry's `seedUrl` changes in the manifest, sync treats it
 * as a brand-new source rather than an update to the old one (the old row is simply not matched
 * anymore and is left as-is, still enabled). Retiring a source whose URL changed should be a
 * deliberate operator action (disable the old row, let sync create the new one) rather than
 * something this sync silently infers.
 */
@Injectable()
export class SourceSyncService {
  private readonly logger = new LoggingService(SourceSyncService.name);

  constructor(
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    @InjectRepository(SourceCandidate)
    private readonly sourceCandidateRepo: Repository<SourceCandidate>,
    private readonly sourcesService: SourcesService,
    private readonly sourceCandidatesService: SourceCandidatesService,
  ) {}

  async syncAll(
    entries: ManifestEntryV2[],
    options: { force?: boolean } = {},
  ): Promise<SyncSummary> {
    const force = options.force ?? false;
    const summary: SyncSummary = { created: [], updated: [], candidatesCreated: [], failed: [] };
    const existingByNormalizedUrl = await this.loadExistingSourcesByNormalizedUrl();

    for (const entry of entries) {
      try {
        await this.syncEntry(entry, force, existingByNormalizedUrl, summary);
      } catch (err) {
        // Continue-on-error, matching FeedFetcherService.fetchAllSources's per-source isolation
        // (each source's fetch is wrapped so one failure can't stop the rest of the cycle): one
        // bad manifest entry must never abort the rest of the sync run.
        this.logger.error(`Failed to sync manifest entry "${entry.seedKey}"`, err);
        summary.failed.push({ seedKey: entry.seedKey, reason: (err as Error).message });
      }
    }

    this.logger.info('Manifest sync complete', {
      created: summary.created.length,
      updated: summary.updated.length,
      candidatesCreated: summary.candidatesCreated.length,
      failed: summary.failed.length,
    });
    return summary;
  }

  private async loadExistingSourcesByNormalizedUrl(): Promise<Map<string, Source>> {
    const all = await this.sourceRepo.find();
    const map = new Map<string, Source>();
    for (const source of all) {
      map.set(normalizeUrl(source.url), source);
    }
    return map;
  }

  private async syncEntry(
    entry: ManifestEntryV2,
    force: boolean,
    existingByNormalizedUrl: Map<string, Source>,
    summary: SyncSummary,
  ): Promise<void> {
    validateManifestEntry(entry);
    const matchKey = normalizeUrl(entry.seedUrl);
    const existing = existingByNormalizedUrl.get(matchKey);

    if (existing) {
      await this.syncExistingSource(existing, entry, force);
      summary.updated.push(entry.seedKey);
      return;
    }

    const outcome = await this.resolveAndCreate(entry);
    if (outcome.ok) {
      summary.created.push(entry.seedKey);
      return;
    }

    await this.createOrRefreshCandidate(entry, outcome.reason ?? 'Unknown discovery failure');
    summary.candidatesCreated.push(entry.seedKey);
  }

  // Declarative fields (name, category, url) always sync. Operational fields (enabled,
  // trustScore) only sync with --force — omitting them from the update DTO entirely (rather than
  // passing them as `undefined`) relies on SourcesService.update's Object.assign(source, dto),
  // which only overwrites keys actually present on `dto`. This is how a re-run leaves an
  // operator's hand-tuned enabled/trustScore untouched even when the manifest has since changed.
  private async syncExistingSource(
    existing: Source,
    entry: ManifestEntryV2,
    force: boolean,
  ): Promise<void> {
    const updateDto: UpdateSourceDto = {
      name: entry.name,
      category: entry.category,
      url: entry.seedUrl,
    };
    if (force) {
      updateDto.enabled = entry.enabled;
      updateDto.trustScore = entry.trustScore;
    }
    await this.sourcesService.update(existing.id, updateDto);
  }

  private async resolveAndCreate(entry: ManifestEntryV2): Promise<CreateOutcome> {
    switch (entry.discovery.mode) {
      case 'web':
        return this.createWebModeSource(entry);
      case 'auto':
        return this.createAutoModeSource(entry);
      case 'rss':
      default:
        return this.createFeedModeSource(entry);
    }
  }

  private async createFeedModeSource(entry: ManifestEntryV2): Promise<CreateOutcome> {
    const validation = await fetchAndValidateFeed(entry.seedUrl);
    if (!validation.ok) {
      return { ok: false, reason: `No working feed at ${entry.seedUrl}: ${validation.message}` };
    }

    await this.sourcesService.create({
      name: entry.name,
      url: entry.seedUrl,
      type: entry.sourceType ?? this.sniffFeedType(validation.rawText),
      category: entry.category,
      enabled: entry.enabled,
      trustScore: entry.trustScore,
    });
    return { ok: true };
  }

  private async createAutoModeSource(entry: ManifestEntryV2): Promise<CreateOutcome> {
    // "auto": try treating seedUrl as a working feed first, then fall back to the full web
    // discovery chain (sitemap -> RSS/Atom -> Cheerio -> Playwright -> optional AI fallback) that
    // SourcesService.create already owns for type: 'web'. Reusing that path here — rather than
    // re-orchestrating SourceDiscoveryService/SourceStructureAiService by hand — keeps that
    // orchestration in one place and avoids a second copy of the AI-fallback wiring.
    const feedValidation = await fetchAndValidateFeed(entry.seedUrl);
    if (feedValidation.ok) {
      await this.sourcesService.create({
        name: entry.name,
        url: entry.seedUrl,
        type: entry.sourceType ?? this.sniffFeedType(feedValidation.rawText),
        category: entry.category,
        enabled: entry.enabled,
        trustScore: entry.trustScore,
      });
      return { ok: true };
    }

    return this.createWebModeSource(entry);
  }

  private async createWebModeSource(entry: ManifestEntryV2): Promise<CreateOutcome> {
    // NOTE: entry.discovery.allowAiFallback is not wired to anything here. SourcesService.create's
    // web-source path gates its AI structural fallback purely on the process-wide
    // SOURCE_DISCOVERY_AI_FALLBACK_ENABLED env var (SourceStructureAiService.isAiFallbackEnabled) —
    // there is no per-call override exposed. Honoring a per-entry `false` would mean
    // reimplementing SourcesService.createWebSource's discovery/fallback orchestration here
    // instead of reusing it. Every manifest entry shipped in this phase uses mode: 'rss' (never
    // reaches this method at all), so the gap has no effect on current behavior; flagged here for
    // whoever adds the first real 'web'/'auto' manifest entry.
    try {
      await this.sourcesService.create({
        name: entry.name,
        url: entry.seedUrl,
        type: SourceType.WEB,
        category: entry.category,
        enabled: entry.enabled,
        trustScore: entry.trustScore,
        webConfig: {
          entryUrls: entry.discovery.entryUrls?.length
            ? entry.discovery.entryUrls
            : [entry.seedUrl],
          articleLinkSelector: entry.discovery.articleLinkSelector,
          allowedPathPatterns: entry.discovery.allowedPathPatterns,
        },
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof BadRequestException) {
        return { ok: false, reason: err.message };
      }
      throw err;
    }
  }

  private sniffFeedType(rawFeedText: string): SourceType {
    return /<feed[\s>]/i.test(rawFeedText) ? SourceType.ATOM : SourceType.RSS;
  }

  // SourceCandidatesService.create() is an idempotent upsert by normalizedUrl that always leaves
  // a brand-new row PENDING (or leaves an existing row's status untouched on refresh) — that
  // upsert logic (dedup, domain extraction, refresh semantics) is reused as-is, never duplicated.
  // A manifest entry that failed discovery during sync is a stronger, already-evaluated signal
  // than a bare not-yet-looked-at candidate, though, so this pushes the resulting row straight to
  // NEEDS_REVIEW with the failure reason recorded — a thin status/reason update layered on top of
  // the reused upsert, not a reimplementation of it.
  private async createOrRefreshCandidate(entry: ManifestEntryV2, reason: string): Promise<void> {
    const input: CreateSourceCandidateInput = {
      url: entry.seedUrl,
      seedKey: entry.seedKey,
      proposedConfig: {
        name: entry.name,
        category: entry.category,
        discoveryMode: entry.discovery.mode,
      },
    };
    const candidate = await this.sourceCandidatesService.create(input);
    await this.sourceCandidateRepo.update(candidate.id, {
      status: SourceCandidateStatus.NEEDS_REVIEW,
      validationError: reason,
    });
  }
}
