import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { LoggingService } from '../../common/logging/logging.service';
import { HttpService } from '../../common/http/http.service';
import { normalizeUrl } from '../../common/util/url-normalize.util';
import { Article, ArticleStatus } from '../../articles/entities/article.entity';
import { ArticlesService } from '../../articles/services/articles.service';
import { AiAnalysisService } from '../../ai-analysis/services/ai-analysis.service';
import {
  SourceCandidate,
  SourceCandidateDetectedType,
  SourceCandidateRejectionCode,
  SourceCandidateStatus,
  SourceDiscoveryOrigin,
} from '../entities/source-candidate.entity';
import { Source, SourceCategory, SourceStatus, SourceType } from '../entities/source.entity';
import { SourceCoverage } from '../entities/source-coverage.entity';
import { WebDiscoveryMethod, WebSourceConfig } from '../entities/web-source-config.entity';
import { ContentExtractionService, toContentExtractionMethod } from './content-extraction.service';
import { DiscoveryResult, SourceDiscoveryService } from './source-discovery.service';
import { SourceIdentityService } from './source-identity.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { TechnologyInterest } from '../../taxonomy/entities/technology-interest.entity';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';
import { parsePublicationDate } from '../../common/util/publication-date.util';

// Bounded sample of the entry URLs discovery already found — this reuses whatever
// sitemap/RSS/Cheerio/Playwright entry set discovery returned, no separate crawl.
const CANDIDATE_SAMPLE_SIZE = 5;
// Minimum count of sampled articles that must come back pre-analysis-relevant to promote.
const PROMOTION_RELEVANCE_THRESHOLD = 1;
const SUMMARY_PREVIEW_LENGTH = 500;

// No dedicated column exists on SourceCandidate for a proposed name/category (the entity is
// already fixed for this phase) — proposedConfig is the flexible jsonb bucket intended for
// exactly this kind of pre-promotion hint. Phase 5's manifest sync is expected to populate it;
// absent that, this is the generic fallback category for a promoted Source.
const DEFAULT_CANDIDATE_CATEGORY = SourceCategory.ENGINEERING_DEEP_DIVES;

export interface CreateSourceCandidateInput {
  url: string;
  seedKey?: string | null;
  origin?: SourceDiscoveryOrigin;
  submittedByUserId?: string | null;
  technologyInterestId?: string | null;
  contentStreamId?: string | null;
  proposedName?: string | null;
  expectedSourceType?: SourceType | null;
  relevanceReason?: string | null;
  proposedConfig?: Record<string, unknown> | null;
}

@Injectable()
export class SourceCandidatesService {
  private readonly logger = new LoggingService(SourceCandidatesService.name);

  constructor(
    @InjectRepository(SourceCandidate)
    private readonly candidateRepo: Repository<SourceCandidate>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    @InjectRepository(SourceCoverage)
    private readonly sourceCoverageRepo: Repository<SourceCoverage>,
    @InjectRepository(TechnologyInterest)
    private readonly taxonomyRepo: Repository<TechnologyInterest>,
    @InjectRepository(ContentStream)
    private readonly contentStreamRepo: Repository<ContentStream>,
    private readonly httpService: HttpService,
    private readonly sourceDiscoveryService: SourceDiscoveryService,
    private readonly contentExtractionService: ContentExtractionService,
    private readonly articlesService: ArticlesService,
    private readonly aiAnalysisService: AiAnalysisService,
    private readonly sourceIdentityService: SourceIdentityService,
    private readonly metricsService: MetricsService,
  ) {}

  // Idempotent upsert by normalizedUrl: re-discovering/re-creating a candidate for the same
  // URL refreshes the existing row (proposedConfig, lastValidatedAt) instead of duplicating it.
  // The entity's unique constraint on normalizedUrl backs this as a last line of defense; this
  // check-then-update is the primary path (mirrors SourcesService.create's existing-row check).
  async create(input: CreateSourceCandidateInput): Promise<SourceCandidate> {
    const normalizedUrl = normalizeUrl(input.url);
    const domain = this.extractDomain(normalizedUrl);

    const existing = await this.candidateRepo.findOne({ where: { normalizedUrl } });
    if (existing) {
      existing.domain = domain;
      if (input.seedKey !== undefined) existing.seedKey = input.seedKey;
      if (input.proposedConfig !== undefined) existing.proposedConfig = input.proposedConfig;
      if (input.submittedByUserId !== undefined)
        existing.submittedByUserId = input.submittedByUserId;
      if (input.technologyInterestId !== undefined)
        existing.technologyInterestId = input.technologyInterestId;
      if (input.contentStreamId !== undefined) existing.contentStreamId = input.contentStreamId;
      if (input.proposedName !== undefined) existing.proposedName = input.proposedName;
      if (input.expectedSourceType !== undefined)
        existing.expectedSourceType = input.expectedSourceType;
      if (input.relevanceReason !== undefined) existing.relevanceReason = input.relevanceReason;
      existing.lastValidatedAt = new Date();

      const saved = await this.candidateRepo.save(existing);
      this.logger.info('Source candidate refreshed (idempotent upsert)', {
        id: saved.id,
        normalizedUrl,
      });
      return saved;
    }

    const created = this.candidateRepo.create({
      normalizedUrl,
      domain,
      seedKey: input.seedKey ?? null,
      origin: input.origin ?? SourceDiscoveryOrigin.SEED,
      submittedByUserId: input.submittedByUserId ?? null,
      technologyInterestId: input.technologyInterestId ?? null,
      contentStreamId: input.contentStreamId ?? null,
      proposedName: input.proposedName ?? null,
      expectedSourceType: input.expectedSourceType ?? null,
      relevanceReason: input.relevanceReason ?? null,
      proposedConfig: input.proposedConfig ?? null,
      status: SourceCandidateStatus.PENDING,
      lastValidatedAt: new Date(),
    });
    const saved = await this.candidateRepo.save(created);
    this.logger.info('Source candidate created', { id: saved.id, normalizedUrl });
    return saved;
  }

  // Discovers the candidate's structure, samples a bounded set of its article URLs, and runs
  // pre-analysis-only on each (never full analysis — token economy, see AiAnalysisService).
  // >= PROMOTION_RELEVANCE_THRESHOLD relevant samples promotes the candidate into a real,
  // enabled Source (+ WebSourceConfig for web sources). Otherwise the candidate always ends up
  // in a defined terminal status with a reason — never silently discarded:
  // Any validation failure ends in `rejected` with a durable code and reason; successful
  // validation ends in `active`. There is no manual-review state.
  async promote(id: string): Promise<SourceCandidate> {
    const candidate = await this.getCandidateOrFail(id);

    let existingSource = await this.sourceIdentityService.findEquivalent(candidate.normalizedUrl);
    const provisionalSourceId = candidate.proposedConfig?.['provisionalSourceId'];
    if (existingSource && provisionalSourceId === existingSource.id) {
      // A previous worker attempt stopped after creating its own provisional source. It is not a
      // validated concurrent winner: remove it (and cascade scratch samples), clear the marker,
      // then restart deterministic validation on this attempt.
      await this.sourceRepo.delete(existingSource.id);
      const config = { ...(candidate.proposedConfig ?? {}) };
      delete config.provisionalSourceId;
      candidate.proposedConfig = config;
      await this.candidateRepo.save(candidate);
      existingSource = null;
    }
    if (existingSource) {
      await this.attachCoverage(existingSource.id, candidate);
      candidate.status = SourceCandidateStatus.ACTIVE;
      candidate.activatedSourceId = existingSource.id;
      candidate.validationError = null;
      candidate.rejectionCode = null;
      return this.candidateRepo.save(candidate);
    }

    const discoveryConfig: Partial<WebSourceConfig> = {
      entryUrls: [candidate.normalizedUrl],
      articleLinkSelector:
        (candidate.proposedConfig?.['articleLinkSelector'] as string | undefined) ?? null,
    };
    const discovery = await this.sourceDiscoveryService.discoverEntryPoints(
      candidate.normalizedUrl,
      discoveryConfig,
    );

    if (!discovery.success || discovery.entryUrls.length === 0) {
      return this.markRejected(
        candidate,
        `Discovery failed: ${discovery.reason ?? 'no article URLs found'}`,
        SourceCandidateRejectionCode.NO_PUBLICATIONS,
      );
    }

    const detectedType = this.mapDetectedType(discovery.method);
    const sampleUrls = discovery.entryUrls.slice(0, CANDIDATE_SAMPLE_SIZE);

    const { source, created } = await this.createProvisionalSource(
      candidate,
      discovery,
      detectedType,
    );

    // Another supported creator may have won after the initial identity check but before
    // discovery completed. The centralized resolver returns that winner; attach provenance and
    // finish the candidate without sampling, mutating, or deleting the winning source.
    if (!created) {
      await this.attachCoverage(source.id, candidate);
      candidate.status = SourceCandidateStatus.ACTIVE;
      candidate.detectedType = detectedType;
      candidate.activatedSourceId = source.id;
      candidate.validationError = null;
      candidate.rejectionCode = null;
      candidate.lastValidatedAt = new Date();
      return this.candidateRepo.save(candidate);
    }

    candidate.proposedConfig = {
      ...(candidate.proposedConfig ?? {}),
      provisionalSourceId: source.id,
    };
    await this.candidateRepo.save(candidate);

    const sampledArticles: Article[] = [];
    for (const url of sampleUrls) {
      const article = await this.tryCreateSampleArticle(source.id, url);
      if (article) sampledArticles.push(article);
    }

    let relevantCount = 0;
    const [originTaxonomy, originStream] = await Promise.all([
      candidate.technologyInterestId
        ? this.taxonomyRepo.findOne({ where: { id: candidate.technologyInterestId } })
        : null,
      candidate.contentStreamId
        ? this.contentStreamRepo.findOne({ where: { id: candidate.contentStreamId } })
        : null,
    ]);
    for (const article of sampledArticles) {
      const relevance = await this.aiAnalysisService.preAnalyzeArticle(
        article.id,
        originTaxonomy?.name,
        originStream?.key,
      );
      if (relevance.preScreenIsRelevant) relevantCount++;
    }

    if (relevantCount >= PROMOTION_RELEVANCE_THRESHOLD) {
      await this.sourceRepo.update(source.id, { enabled: true });
      await this.sourceRepo.update(source.id, { status: SourceStatus.ACTIVE });

      // These sample Articles (and their cascade-linked ArticleAnalysis/ArticleTechnologyInterest/
      // ArticleStream rows — FK ON DELETE CASCADE, see the GlobalArticleAnalysisRework migration)
      // were scratch work to evaluate promotion, not real ingestion. Hard-delete them so
      // findByUrlHash finds nothing for these URLs on the now-enabled source's next fetch cycle:
      // they get freshly re-ingested through the normal PENDING_ANALYSIS ->
      // QueueService.addAnalyzeArticleJob path instead of being stranded at NEW forever (neither
      // fetcher re-processes a URL with an existing Article row, regardless of status).
      await this.articlesService.deleteByIds(sampledArticles.map((article) => article.id));

      candidate.status = SourceCandidateStatus.ACTIVE;
      candidate.detectedType = detectedType;
      candidate.validationError = null;
      candidate.rejectionCode = null;
      candidate.activatedSourceId = source.id;
      candidate.lastValidatedAt = new Date();
      const promotedConfig = { ...(candidate.proposedConfig ?? {}) };
      delete promotedConfig.provisionalSourceId;
      candidate.proposedConfig = { ...promotedConfig, promotedSourceId: source.id };

      await this.attachCoverage(source.id, candidate);
      const saved = await this.candidateRepo.save(candidate);
      await this.metricsService.increment('source_candidates_total', { outcome: 'activated' });
      this.logger.info('Source candidate promoted', {
        id: saved.id,
        sourceId: source.id,
        relevantCount,
        sampled: sampledArticles.length,
      });
      return saved;
    }

    // Roll back the provisional Source; ON DELETE CASCADE removes its WebSourceConfig and the
    // sample Articles with it, so no orphaned scratch data is left behind.
    await this.sourceRepo.delete(source.id);
    const rejectedConfig = { ...(candidate.proposedConfig ?? {}) };
    delete rejectedConfig.provisionalSourceId;
    candidate.proposedConfig = rejectedConfig;

    candidate.detectedType = detectedType;
    return this.markRejected(
      candidate,
      `Only ${relevantCount} of ${sampledArticles.length} sampled article(s) were pre-analysis ` +
        `relevant (minimum ${PROMOTION_RELEVANCE_THRESHOLD} required)`,
      SourceCandidateRejectionCode.TAXONOMY_MISMATCH,
    );
  }

  async rejectProcessingFailure(id: string, error: unknown): Promise<SourceCandidate> {
    const candidate = await this.getCandidateOrFail(id);
    const provisionalSourceId = candidate.proposedConfig?.['provisionalSourceId'];
    if (typeof provisionalSourceId === 'string') {
      await this.sourceRepo.delete(provisionalSourceId);
      const config = { ...(candidate.proposedConfig ?? {}) };
      delete config.provisionalSourceId;
      candidate.proposedConfig = config;
    }
    return this.markRejected(
      candidate,
      error instanceof Error ? error.message : String(error),
      SourceCandidateRejectionCode.PROCESSING_FAILED,
    );
  }

  // Creates a genuine `rss`/`atom` Source (no WebSourceConfig) when discovery actually succeeded
  // via a feed AND captured the working feed URL — that Source's hourly fetch just re-fetches
  // `source.url` directly as a feed, which is strictly cheaper and more accurate than routing
  // through WebSourceFetcherService (one fewer HTTP round trip per article, native Readability-
  // free parsing, feed-native `author` metadata). Falls back to a `web`-type Source with a
  // WebSourceConfig for everything else (detected type `web`, or a feed URL that for some reason
  // wasn't captured) — WebSourceFetcherService's recipe already knows how to re-run the
  // sitemap/cheerio/playwright chain against `source.url` every cycle.
  private async createProvisionalSource(
    candidate: SourceCandidate,
    discovery: DiscoveryResult,
    detectedType: SourceCandidateDetectedType,
  ): Promise<{ source: Source; webConfig: WebSourceConfig | null; created: boolean }> {
    const name = (candidate.proposedConfig?.['name'] as string | undefined) ?? candidate.domain;
    const category =
      (candidate.proposedConfig?.['category'] as SourceCategory | undefined) ??
      DEFAULT_CANDIDATE_CATEGORY;

    const isGenuineFeed =
      (detectedType === SourceCandidateDetectedType.RSS ||
        detectedType === SourceCandidateDetectedType.ATOM) &&
      !!discovery.feedUrl;

    let webConfig: WebSourceConfig | null = null;
    const identityUrl = isGenuineFeed ? discovery.feedUrl! : candidate.normalizedUrl;
    const resolution = await this.sourceIdentityService.resolveOrCreate(
      identityUrl,
      async (manager, normalizedUrl) => {
        if (isGenuineFeed) {
          const source = await manager.save(
            Source,
            manager.create(Source, {
              name,
              url: normalizedUrl,
              type:
                detectedType === SourceCandidateDetectedType.ATOM
                  ? SourceType.ATOM
                  : SourceType.RSS,
              category,
              // Provisional: only flipped to true once >= PROMOTION_RELEVANCE_THRESHOLD sampled
              // articles are confirmed relevant, so the normal fetch cycle (findAllEnabled) never
              // picks this source up while it's still being evaluated.
              enabled: false,
            }),
          );

          return source;
        }

        const source = await manager.save(
          Source,
          manager.create(Source, {
            name,
            url: normalizedUrl,
            type: SourceType.WEB,
            category,
            enabled: false,
          }),
        );

        webConfig = await manager.save(
          WebSourceConfig,
          manager.create(WebSourceConfig, {
            sourceId: source.id,
            // The listing/seed URL to re-crawl links from on every subsequent cycle — NOT
            // discovery.entryUrls (that's the individual article permalinks discovery just found).
            // For CHEERIO/PLAYWRIGHT methods, a non-empty entryUrls here overrides `source.url` as
            // the crawl seed on replay (see discoverViaCheerio/discoverViaPlaywright), and this
            // config is never rewritten by the self-healing path — so seeding it with stale
            // article permalinks would permanently break future discovery for this source.
            entryUrls: [candidate.normalizedUrl],
            sitemapUrl: discovery.sitemapUrl ?? null,
            preferredDiscoveryMethod: discovery.method,
            articleLinkSelector: discovery.articleLinkSelector ?? null,
            lastValidatedAt: new Date(),
          }),
        );

        return source;
      },
    );
    return { source: resolution.source, webConfig, created: resolution.created };
  }

  private async tryCreateSampleArticle(sourceId: string, url: string): Promise<Article | null> {
    try {
      const normalized = normalizeUrl(url);
      const urlHash = createHash('sha256').update(normalized).digest('hex');

      const existingArticle = await this.articlesService.findByUrlHash(urlHash);
      if (existingArticle) return null;

      const response = await this.httpService.request<string>({
        method: 'GET',
        url: normalized,
        responseType: 'text',
      });

      const extraction = this.contentExtractionService.extract(response.data, normalized, null);
      if (!extraction.success || !extraction.isArticle || !extraction.title || !extraction.method) {
        return null;
      }

      const title = extraction.title.trim();
      const titleHash = createHash('sha256').update(title).digest('hex');

      return await this.articlesService.create({
        sourceId,
        title,
        url: normalized,
        urlHash,
        titleHash,
        summaryFromFeed: extraction.textContent?.slice(0, SUMMARY_PREVIEW_LENGTH) ?? null,
        publishedAt: parsePublicationDate(extraction.publishedAt),
        status: ArticleStatus.NEW,
        contentExtractionMethod: toContentExtractionMethod(extraction.method),
        contentExtractionConfig: { method: extraction.method },
        contentFetchedAt: new Date(),
      });
    } catch (err) {
      this.logger.warn('Failed to sample candidate article, skipping', {
        url,
        error: (err as Error).message,
      });
      return null;
    }
  }

  private async markRejected(
    candidate: SourceCandidate,
    reason: string,
    code: SourceCandidateRejectionCode = SourceCandidateRejectionCode.PROCESSING_FAILED,
  ): Promise<SourceCandidate> {
    candidate.status = SourceCandidateStatus.REJECTED;
    candidate.validationError = reason;
    candidate.rejectionCode = code;
    candidate.lastValidatedAt = new Date();

    const saved = await this.candidateRepo.save(candidate);
    await this.metricsService.increment('source_candidates_total', { outcome: 'rejected', code });
    this.logger.info('Source candidate rejected', { id: saved.id, reason });
    return saved;
  }

  private async attachCoverage(sourceId: string, candidate: SourceCandidate): Promise<void> {
    if (!candidate.technologyInterestId || !candidate.contentStreamId) return;
    const existing = await this.sourceCoverageRepo.findOne({
      where: {
        sourceId,
        technologyInterestId: candidate.technologyInterestId,
        contentStreamId: candidate.contentStreamId,
      },
    });
    if (!existing) {
      await this.sourceCoverageRepo.save(
        this.sourceCoverageRepo.create({
          sourceId,
          technologyInterestId: candidate.technologyInterestId,
          contentStreamId: candidate.contentStreamId,
          origin: candidate.origin,
        }),
      );
    }
  }

  private async getCandidateOrFail(id: string): Promise<SourceCandidate> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const candidate = await this.candidateRepo.findOne({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`Source candidate ${id} not found`);
    }
    return candidate;
  }

  private mapDetectedType(method: DiscoveryResult['method']): SourceCandidateDetectedType {
    switch (method) {
      case WebDiscoveryMethod.RSS:
        return SourceCandidateDetectedType.RSS;
      case WebDiscoveryMethod.ATOM:
        return SourceCandidateDetectedType.ATOM;
      default:
        return SourceCandidateDetectedType.WEB;
    }
  }

  private extractDomain(normalizedUrl: string): string {
    try {
      return new URL(normalizedUrl).hostname.toLowerCase();
    } catch {
      return normalizedUrl;
    }
  }
}
