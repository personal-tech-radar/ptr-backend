import { Injectable, OnModuleInit } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
import * as path from 'path';
import { HttpService } from '../../common/http/http.service';
import { LoggingService } from '../../common/logging/logging.service';
import { RedisService } from '../../common/redis/redis.service';
import { WebDiscoveryMethod, WebSourceConfig } from '../entities/web-source-config.entity';
import { DiscoveryResult, SourceDiscoveryService } from './source-discovery.service';

const MAX_HEADINGS = 15;
const MAX_JSON_LD_FRAGMENTS = 3;
const MAX_HTML_FRAGMENTS = 3;
const MAX_CANDIDATE_LINKS = 40;
const MAX_LINK_TEXT_LENGTH = 120;
const MAX_FRAGMENT_LENGTH = 800;
const MAX_SITEMAP_PEEK = 10;

const AI_FALLBACK_REDIS_KEY_PREFIX = 'source-discovery:ai-fallback:count:';
const REDIS_COUNTER_TTL_SECONDS = 60 * 60 * 24;

export function isAiFallbackEnabled(): boolean {
  return process.env.SOURCE_DISCOVERY_AI_FALLBACK_ENABLED === 'true';
}

interface StructureSnapshot {
  url: string;
  title: string | null;
  headings: string[];
  feedLinksFound: string[];
  sitemapUrlsFound: string[];
  jsonLdFragments: string[];
  htmlFragments: string[];
  candidateLinks: { href: string; text: string }[];
  failureSummary: string;
}

interface AiStructureSuggestion {
  method: WebDiscoveryMethod.CHEERIO | WebDiscoveryMethod.PLAYWRIGHT;
  articleLinkSelector?: string;
  entryUrls?: string[];
  reasoning?: string;
}

// Not exported — the nominal brand key for `ValidatedDiscoverySuggestion`. Since the symbol never
// leaves this module, no other file can write a matching `[validatedDiscoverySuggestionBrand]`
// property, so TypeScript rejects object-literal construction and a plain `as
// ValidatedDiscoverySuggestion` cast anywhere outside `suggestAndValidate` below — real compiler
// enforcement, not a naming convention.
const validatedDiscoverySuggestionBrand: unique symbol = Symbol('ValidatedDiscoverySuggestion');

/**
 * Result of `suggestAndValidate`. `validated: true` is only ever produced after the AI's raw
 * suggestion has been re-run through the real deterministic (Cheerio) or Playwright discovery
 * path and actually returned entry URLs — never from the AI response alone. There is
 * intentionally no way to construct this type with `validated: true` other than through that
 * re-validation; callers must not persist a recipe from anything else.
 */
export interface ValidatedDiscoverySuggestion {
  readonly validated: true;
  readonly result: DiscoveryResult;
  readonly [validatedDiscoverySuggestionBrand]: true;
}

/**
 * OpenAI-backed structural fallback for web source discovery — the last resort after the entire
 * deterministic chain (sitemap/RSS/Cheerio/Playwright) has failed. Assembles a small, bounded
 * snapshot of the entry page (never full page content), asks OpenAI for a suggested discovery
 * method + selector, and then re-runs that suggestion through the real deterministic machinery
 * before it is ever treated as usable. A suggestion that fails re-validation is discarded.
 *
 * Gated by SOURCE_DISCOVERY_AI_FALLBACK_ENABLED (default false) and capped by
 * SOURCE_DISCOVERY_AI_FALLBACK_MAX_PER_DAY via a Redis-backed daily counter, to bound OpenAI
 * spend on a class of source that is by definition hard to handle automatically.
 */
@Injectable()
export class SourceStructureAiService implements OnModuleInit {
  private readonly logger = new LoggingService(SourceStructureAiService.name);
  private openai: OpenAI;
  private instructionTemplate = '';

  constructor(
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
    private readonly sourceDiscoveryService: SourceDiscoveryService,
  ) {}

  onModuleInit(): void {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.loadInstructionTemplate();
  }

  private loadInstructionTemplate(): void {
    try {
      const filePath = path.join(__dirname, '..', 'instructions', 'discover-source-structure.txt');
      this.instructionTemplate = readFileSync(filePath, 'utf8');
    } catch (err) {
      this.logger.error('Failed to load discover-source-structure.txt', err);
      this.instructionTemplate = '';
    }
  }

  async suggestAndValidate(
    baseUrl: string,
    config: Partial<WebSourceConfig> | null | undefined,
    failureReason: string,
  ): Promise<ValidatedDiscoverySuggestion | null> {
    if (!isAiFallbackEnabled()) {
      this.logger.info('AI structural fallback is disabled, skipping', { baseUrl });
      return null;
    }

    const withinQuota = await this.consumeDailyQuota();
    if (!withinQuota) {
      this.logger.warn('AI structural fallback daily cap reached, skipping', { baseUrl });
      return null;
    }

    let suggestion: AiStructureSuggestion;
    try {
      const snapshot = await this.buildSnapshot(baseUrl, config, failureReason);
      suggestion = await this.callOpenAI(snapshot);
    } catch (err) {
      this.logger.error('AI structural fallback call failed', err, { baseUrl });
      return null;
    }

    const revalidated = await this.revalidate(baseUrl, config, suggestion);
    if (!revalidated) {
      this.logger.warn('AI-suggested recipe failed deterministic re-validation, discarding', {
        baseUrl,
        suggestion,
      });
      return null;
    }

    this.logger.info('AI-suggested recipe passed re-validation', {
      baseUrl,
      method: revalidated.method,
    });
    return { validated: true, result: revalidated, [validatedDiscoverySuggestionBrand]: true };
  }

  private async consumeDailyQuota(): Promise<boolean> {
    const cap = parseInt(process.env.SOURCE_DISCOVERY_AI_FALLBACK_MAX_PER_DAY || '10', 10);
    const key = `${AI_FALLBACK_REDIS_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;

    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, REDIS_COUNTER_TTL_SECONDS);
    }

    return count <= cap;
  }

  private async revalidate(
    baseUrl: string,
    config: Partial<WebSourceConfig> | null | undefined,
    suggestion: AiStructureSuggestion,
  ): Promise<DiscoveryResult | null> {
    const candidateConfig: Partial<WebSourceConfig> = {
      ...config,
      entryUrls: suggestion.entryUrls?.length ? suggestion.entryUrls : (config?.entryUrls ?? null),
      articleLinkSelector: suggestion.articleLinkSelector ?? config?.articleLinkSelector ?? null,
    };

    const result = await this.sourceDiscoveryService.runDiscoveryMethod(
      suggestion.method,
      baseUrl,
      candidateConfig,
    );

    return result.success ? result : null;
  }

  private async buildSnapshot(
    baseUrl: string,
    config: Partial<WebSourceConfig> | null | undefined,
    failureReason: string,
  ): Promise<StructureSnapshot> {
    const entryUrl = config?.entryUrls?.[0] ?? baseUrl;

    let html = '';
    try {
      const response = await this.httpService.getText(entryUrl);
      html = response.status === 200 ? response.data : '';
    } catch {
      html = '';
    }

    const $ = cheerio.load(html || '<html></html>');

    const title = $('title').first().text().trim() || null;

    const headings = $('h1, h2, h3')
      .slice(0, MAX_HEADINGS)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

    const feedLinksFound: string[] = [];
    $('link[rel="alternate"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) feedLinksFound.push(href);
    });

    const jsonLdFragments = $('script[type="application/ld+json"]')
      .slice(0, MAX_JSON_LD_FRAGMENTS)
      .map((_, el) => $(el).contents().text().trim().slice(0, MAX_FRAGMENT_LENGTH))
      .get()
      .filter(Boolean);

    const candidateLinks = $('a[href]')
      .slice(0, MAX_CANDIDATE_LINKS)
      .map((_, el) => ({
        href: $(el).attr('href') ?? '',
        text: $(el).text().trim().slice(0, MAX_LINK_TEXT_LENGTH),
      }))
      .get()
      .filter((link) => link.href);

    const htmlFragments = $('article, main, .post, .entry-content')
      .slice(0, MAX_HTML_FRAGMENTS)
      .map((_, el) => ($.html(el) ?? '').slice(0, MAX_FRAGMENT_LENGTH))
      .get();

    const sitemapUrlsFound = await this.peekCommonSitemap(baseUrl);

    return {
      url: entryUrl,
      title,
      headings,
      feedLinksFound,
      sitemapUrlsFound,
      jsonLdFragments,
      htmlFragments,
      candidateLinks,
      failureSummary: failureReason,
    };
  }

  // Cheap, bounded, best-effort peek at whether a sitemap exists at all — deliberately not the
  // full sitemap-parsing/filtering logic in SourceDiscoveryService (that already ran and failed
  // to produce article URLs); this is just a signal for the AI, not an authoritative source.
  private async peekCommonSitemap(baseUrl: string): Promise<string[]> {
    try {
      const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
      const response = await this.httpService.getText(sitemapUrl);
      if (response.status !== 200) return [];

      const matches = [...response.data.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      return matches.slice(0, MAX_SITEMAP_PEEK);
    } catch {
      return [];
    }
  }

  private async callOpenAI(snapshot: StructureSnapshot): Promise<AiStructureSuggestion> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: this.instructionTemplate },
        { role: 'user', content: JSON.stringify(snapshot) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);

    return {
      method:
        parsed.method === 'playwright' ? WebDiscoveryMethod.PLAYWRIGHT : WebDiscoveryMethod.CHEERIO,
      articleLinkSelector:
        typeof parsed.articleLinkSelector === 'string' ? parsed.articleLinkSelector : undefined,
      entryUrls: Array.isArray(parsed.entryUrls)
        ? parsed.entryUrls.filter((url: unknown): url is string => typeof url === 'string')
        : undefined,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
    };
  }
}
