import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
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
  SourceCandidateStatus,
} from '../entities/source-candidate.entity';
import { Source, SourceCategory, SourceType } from '../entities/source.entity';
import { WebDiscoveryMethod, WebSourceConfig } from '../entities/web-source-config.entity';
import { ContentExtractionService, toContentExtractionMethod } from './content-extraction.service';
import { DiscoveryResult, SourceDiscoveryService } from './source-discovery.service';

// Bounded sample of the entry URLs discovery already found — this reuses whatever
// sitemap/RSS/Cheerio/Playwright entry set discovery returned, no separate crawl.
const CANDIDATE_SAMPLE_SIZE = 5;
// Minimum count of sampled articles that must come back pre-analysis-relevant to promote.
const PROMOTION_RELEVANCE_THRESHOLD = 2;
const SUMMARY_PREVIEW_LENGTH = 500;

// No dedicated column exists on SourceCandidate for a proposed name/category (the entity is
// already fixed for this phase) — proposedConfig is the flexible jsonb bucket intended for
// exactly this kind of pre-promotion hint. Phase 5's manifest sync is expected to populate it;
// absent that, this is the generic fallback category for a promoted Source.
const DEFAULT_CANDIDATE_CATEGORY = SourceCategory.ENGINEERING_DEEP_DIVES;

export interface CreateSourceCandidateInput {
  url: string;
  discoveredFromArticleId?: string | null;
  seedKey?: string | null;
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
    private readonly httpService: HttpService,
    private readonly sourceDiscoveryService: SourceDiscoveryService,
    private readonly contentExtractionService: ContentExtractionService,
    private readonly articlesService: ArticlesService,
    private readonly aiAnalysisService: AiAnalysisService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
      if (input.discoveredFromArticleId !== undefined) {
        existing.discoveredFromArticleId = input.discoveredFromArticleId;
      }
      if (input.seedKey !== undefined) existing.seedKey = input.seedKey;
      if (input.proposedConfig !== undefined) existing.proposedConfig = input.proposedConfig;
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
      discoveredFromArticleId: input.discoveredFromArticleId ?? null,
      seedKey: input.seedKey ?? null,
      proposedConfig: input.proposedConfig ?? null,
      status: SourceCandidateStatus.PENDING,
      lastValidatedAt: new Date(),
    });
    const saved = await this.candidateRepo.save(created);
    this.logger.info('Source candidate created', { id: saved.id, normalizedUrl });
    return saved;
  }

  async reject(id: string, reason?: string): Promise<SourceCandidate> {
    const candidate = await this.getCandidateOrFail(id);
    candidate.status = SourceCandidateStatus.REJECTED;
    candidate.validationError = reason ?? 'Manually rejected';
    candidate.lastValidatedAt = new Date();

    const saved = await this.candidateRepo.save(candidate);
    this.logger.info('Source candidate manually rejected', {
      id: saved.id,
      reason: saved.validationError,
    });
    return saved;
  }

  // Discovers the candidate's structure, samples a bounded set of its article URLs, and runs
  // pre-analysis-only on each (never full analysis — token economy, see AiAnalysisService).
  // >= PROMOTION_RELEVANCE_THRESHOLD relevant samples promotes the candidate into a real,
  // enabled Source (+ WebSourceConfig for web sources). Otherwise the candidate always ends up
  // in a defined terminal status with a reason — never silently discarded:
  //   - 'rejected'      when discovery itself fails outright (no structure could be found at all)
  //   - 'needs_review'  when discovery succeeds but too few sampled articles are relevant
  //     (the site is real, just not confidently a match — worth a human look, not a hard no)
  async promote(id: string): Promise<SourceCandidate> {
    const candidate = await this.getCandidateOrFail(id);

    const existingSource = await this.sourceRepo.findOne({
      where: { url: candidate.normalizedUrl },
    });
    if (existingSource) {
      return this.markRejected(candidate, 'A source for this URL already exists');
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
      );
    }

    const detectedType = this.mapDetectedType(discovery.method);
    const sampleUrls = discovery.entryUrls.slice(0, CANDIDATE_SAMPLE_SIZE);

    const { source } = await this.createProvisionalSource(candidate, discovery, detectedType);

    const sampledArticles: Article[] = [];
    for (const url of sampleUrls) {
      const article = await this.tryCreateSampleArticle(source.id, url);
      if (article) sampledArticles.push(article);
    }

    let relevantCount = 0;
    for (const article of sampledArticles) {
      const relevance = await this.aiAnalysisService.preAnalyzeArticle(article.id);
      if (relevance.preAnalysisIsRelevant) relevantCount++;
    }

    if (relevantCount >= PROMOTION_RELEVANCE_THRESHOLD) {
      await this.sourceRepo.update(source.id, { enabled: true });
      candidate.status = SourceCandidateStatus.PROMOTED;
      candidate.detectedType = detectedType;
      candidate.validationError = null;
      candidate.lastValidatedAt = new Date();
      candidate.proposedConfig = {
        ...(candidate.proposedConfig ?? {}),
        promotedSourceId: source.id,
      };

      const saved = await this.candidateRepo.save(candidate);
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

    return this.markNeedsReview(
      candidate,
      detectedType,
      `Only ${relevantCount} of ${sampledArticles.length} sampled article(s) were pre-analysis ` +
        `relevant (minimum ${PROMOTION_RELEVANCE_THRESHOLD} required)`,
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
  ): Promise<{ source: Source; webConfig: WebSourceConfig | null }> {
    const name = (candidate.proposedConfig?.['name'] as string | undefined) ?? candidate.domain;
    const category =
      (candidate.proposedConfig?.['category'] as SourceCategory | undefined) ??
      DEFAULT_CANDIDATE_CATEGORY;

    const isGenuineFeed =
      (detectedType === SourceCandidateDetectedType.RSS ||
        detectedType === SourceCandidateDetectedType.ATOM) &&
      !!discovery.feedUrl;

    return this.dataSource.transaction(async (manager) => {
      if (isGenuineFeed) {
        const source = await manager.save(
          Source,
          manager.create(Source, {
            name,
            url: discovery.feedUrl!,
            type:
              detectedType === SourceCandidateDetectedType.ATOM ? SourceType.ATOM : SourceType.RSS,
            category,
            // Provisional: only flipped to true once >= PROMOTION_RELEVANCE_THRESHOLD sampled
            // articles are confirmed relevant, so the normal fetch cycle (findAllEnabled) never
            // picks this source up while it's still being evaluated.
            enabled: false,
          }),
        );

        return { source, webConfig: null };
      }

      const source = await manager.save(
        Source,
        manager.create(Source, {
          name,
          url: candidate.normalizedUrl,
          type: SourceType.WEB,
          category,
          enabled: false,
        }),
      );

      const webConfig = await manager.save(
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

      return { source, webConfig };
    });
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
      if (!extraction.success || !extraction.title || !extraction.method) return null;

      const title = extraction.title.trim();
      const titleHash = createHash('sha256').update(title).digest('hex');

      return await this.articlesService.create({
        sourceId,
        title,
        url: normalized,
        urlHash,
        titleHash,
        summaryFromFeed: extraction.textContent?.slice(0, SUMMARY_PREVIEW_LENGTH) ?? null,
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

  private async markRejected(candidate: SourceCandidate, reason: string): Promise<SourceCandidate> {
    candidate.status = SourceCandidateStatus.REJECTED;
    candidate.validationError = reason;
    candidate.lastValidatedAt = new Date();

    const saved = await this.candidateRepo.save(candidate);
    this.logger.info('Source candidate rejected', { id: saved.id, reason });
    return saved;
  }

  private async markNeedsReview(
    candidate: SourceCandidate,
    detectedType: SourceCandidateDetectedType,
    reason: string,
  ): Promise<SourceCandidate> {
    candidate.status = SourceCandidateStatus.NEEDS_REVIEW;
    candidate.detectedType = detectedType;
    candidate.validationError = reason;
    candidate.lastValidatedAt = new Date();

    const saved = await this.candidateRepo.save(candidate);
    this.logger.info('Source candidate needs review', { id: saved.id, reason });
    return saved;
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
