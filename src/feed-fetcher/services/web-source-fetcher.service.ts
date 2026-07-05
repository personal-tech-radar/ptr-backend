import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { LoggingService } from '../../common/logging/logging.service';
import { HttpService } from '../../common/http/http.service';
import { normalizeUrl } from '../../common/util/url-normalize.util';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { ArticlesService } from '../../articles/services/articles.service';
import {
  ContentExtractionService,
  ExtractionMethod,
  toContentExtractionMethod,
  toWebExtractionMethod,
} from '../../sources/services/content-extraction.service';
import {
  DiscoveryResult,
  SourceDiscoveryService,
} from '../../sources/services/source-discovery.service';
import { SourcesService } from '../../sources/services/sources.service';
import { Source } from '../../sources/entities/source.entity';
import { WebSourceConfig } from '../../sources/entities/web-source-config.entity';
import { QueueService } from '../../queue/queue.service';

type SourceWithWebConfig = Source & { webConfig?: WebSourceConfig };

const TITLE_DUPLICATE_WINDOW_DAYS = 7;
const SUMMARY_PREVIEW_LENGTH = 500;

/**
 * Fetches and ingests articles for a `Source` of type `web`. Tries the stored
 * discovery recipe first (fast path); on failure, walks the full deterministic
 * fallback chain via `SourceDiscoveryService`. When the chain succeeds with a
 * method different from the stored recipe, the new method is persisted back
 * onto `WebSourceConfig` (self-healing). Total failure is logged and swallowed
 * so `FeedFetcherService.fetchAllSources`'s continue-on-error pattern keeps working.
 */
@Injectable()
export class WebSourceFetcherService {
  private readonly logger = new LoggingService(WebSourceFetcherService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly sourceDiscoveryService: SourceDiscoveryService,
    private readonly contentExtractionService: ContentExtractionService,
    private readonly sourcesService: SourcesService,
    private readonly articlesService: ArticlesService,
    private readonly queueService: QueueService,
  ) {}

  async fetchSource(source: SourceWithWebConfig): Promise<void> {
    const config = source.webConfig;
    if (!config) {
      this.logger.error('Web source has no WebSourceConfig, skipping', null, {
        sourceId: source.id,
        name: source.name,
      });
      return;
    }

    const { result, usedStoredRecipe } = await this.discover(source, config);

    if (!result.success) {
      this.logger.error('Web source discovery failed across the full fallback chain', null, {
        sourceId: source.id,
        name: source.name,
        reason: result.reason,
      });
      return;
    }

    if (!usedStoredRecipe && result.method !== config.preferredDiscoveryMethod) {
      await this.sourcesService.updateWebSourceConfigRecipe(source.id, {
        preferredDiscoveryMethod: result.method,
        articleLinkSelector: result.articleLinkSelector ?? config.articleLinkSelector,
      });
      config.preferredDiscoveryMethod = result.method;
    }

    let newCount = 0;
    for (const articleUrl of result.entryUrls) {
      try {
        const created = await this.tryIngestArticle(
          source,
          config,
          articleUrl,
          result.entryDates?.[articleUrl],
        );
        if (created) newCount++;
      } catch (err) {
        this.logger.error(`Failed to process web article from ${source.name}`, err, {
          url: articleUrl,
        });
      }
    }

    await this.sourcesService.updateLastChecked(source.id);
    this.logger.info(`Finished fetching web source ${source.name}`, {
      newCount,
      method: result.method,
    });
  }

  private async discover(
    source: Source,
    config: WebSourceConfig,
  ): Promise<{ result: DiscoveryResult; usedStoredRecipe: boolean }> {
    if (config.preferredDiscoveryMethod) {
      const recipeResult = await this.sourceDiscoveryService.runDiscoveryMethod(
        config.preferredDiscoveryMethod,
        source.url,
        config,
      );
      if (recipeResult.success) {
        return { result: recipeResult, usedStoredRecipe: true };
      }
    }

    const chainResult = await this.sourceDiscoveryService.discoverEntryPoints(source.url, config);
    return { result: chainResult, usedStoredRecipe: false };
  }

  private async tryIngestArticle(
    source: Source,
    config: WebSourceConfig,
    articleUrl: string,
    sitemapLastmod?: string,
  ): Promise<boolean> {
    const normalizedUrl = normalizeUrl(articleUrl);
    const urlHash = createHash('sha256').update(normalizedUrl).digest('hex');

    const existing = await this.articlesService.findByUrlHash(urlHash);
    if (existing) return false;

    const response = await this.httpService.request<string>({
      method: 'GET',
      url: normalizedUrl,
      responseType: 'text',
    });

    const extraction = this.contentExtractionService.extract(
      response.data,
      normalizedUrl,
      config.articleContentSelector,
    );

    if (!extraction.success || !extraction.title || !extraction.method) {
      this.logger.error('Web article extraction failed across the full ladder, skipping', null, {
        url: normalizedUrl,
      });
      return false;
    }

    const title = extraction.title.trim();
    const titleHash = createHash('sha256').update(title).digest('hex');
    const titleDuplicate = await this.articlesService.findByTitleHashInLastDays(
      titleHash,
      TITLE_DUPLICATE_WINDOW_DAYS,
    );
    const status = titleDuplicate ? ArticleStatus.DUPLICATE : ArticleStatus.NEW;

    const article = await this.articlesService.create({
      sourceId: source.id,
      title,
      url: normalizedUrl,
      urlHash,
      titleHash,
      rawContent: extraction.content,
      summaryFromFeed: extraction.textContent?.slice(0, SUMMARY_PREVIEW_LENGTH) ?? null,
      publishedAt: this.resolvePublishedAt(sitemapLastmod, extraction.publishedAt),
      status,
      contentExtractionMethod: toContentExtractionMethod(extraction.method),
      contentExtractionConfig: { method: extraction.method },
      contentFetchedAt: new Date(),
    });

    await this.persistExtractionMethodIfChanged(source.id, config, extraction.method);

    if (status === ArticleStatus.NEW) {
      await this.articlesService.updateStatus(article.id, ArticleStatus.PENDING_ANALYSIS);
      await this.queueService.addAnalyzeArticleJob(article.id);
    }

    return true;
  }

  // Priority: sitemap <lastmod> -> JSON-LD/OpenGraph date surfaced by the content-extraction
  // ladder -> ingestion time. The last option should be the rare case, not the default, for
  // sources with reasonable sitemap/structured-data hygiene.
  private resolvePublishedAt(sitemapLastmod?: string, extractedDate?: string | null): Date {
    return this.parseDate(sitemapLastmod) ?? this.parseDate(extractedDate) ?? new Date();
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  private async persistExtractionMethodIfChanged(
    sourceId: string,
    config: WebSourceConfig,
    observedMethod: ExtractionMethod,
  ): Promise<void> {
    const mapped = toWebExtractionMethod(observedMethod);
    if (mapped === config.preferredExtractionMethod) return;

    config.preferredExtractionMethod = mapped;
    await this.sourcesService.updateWebSourceConfigRecipe(sourceId, {
      preferredExtractionMethod: mapped,
    });
  }
}
