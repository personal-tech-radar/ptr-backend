import { Injectable } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { XMLParser } from 'fast-xml-parser';
import { HttpService } from '../../common/http/http.service';
import { LoggingService } from '../../common/logging/logging.service';
import { fetchAndValidateFeed } from '../../common/util/feed-validator.util';
import { normalizeUrl } from '../../common/util/url-normalize.util';
import { WebDiscoveryMethod, WebSourceConfig } from '../entities/web-source-config.entity';

export interface DiscoveryResult {
  success: boolean;
  method: WebDiscoveryMethod | null;
  entryUrls: string[];
  // Sitemap-only: maps an entry URL to its raw <lastmod> string, when present. Used as a
  // publish-date signal by WebSourceFetcherService; not populated by the RSS/Cheerio steps.
  entryDates?: Record<string, string>;
  articleLinkSelector?: string | null;
  sitemapUrl?: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason?: string;
}

const SITEMAP_SAMPLE_SIZE = 20;
const MAX_NESTED_SITEMAPS = 3;
const MAX_SITEMAP_DEPTH = 1;
const MAX_CHEERIO_LINKS = 30;
const MIN_LINK_GROUP_SIZE = 3;

const COMMON_SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'];
const COMMON_FEED_PATHS = ['/feed', '/feed/', '/rss', '/rss.xml', '/atom.xml'];

const JUNK_PATH_FRAGMENTS = [
  '/tag/',
  '/tags/',
  '/category/',
  '/categories/',
  '/page/',
  '/author/',
  '/search',
  '/wp-content/',
  '/wp-json/',
  '/feed',
  '/rss',
  '/comments/',
  '/attachment/',
  '/cdn-cgi/',
  '/wp-admin/',
  '/login',
  '/signup',
  '/cart',
  '/privacy',
  '/terms',
  '/about',
  '/contact',
  '/subscribe',
];

const NAV_LIKE_SELECTORS = 'nav, footer, header, aside';

interface SitemapEntry {
  loc?: unknown;
  lastmod?: unknown;
}

interface SitemapUrlItem {
  url: string;
  lastmod?: string;
}

interface SitemapXml {
  sitemapindex?: { sitemap?: SitemapEntry | SitemapEntry[] };
  urlset?: { url?: SitemapEntry | SitemapEntry[] };
}

/**
 * Deterministic entry-point discovery fallback chain for `web` sources:
 * robots.txt sitemap directive -> common sitemap paths -> RSS/Atom -> Cheerio
 * listing-page link discovery. Playwright/LLM fallback is explicitly out of
 * scope for this phase; the chain simply reports failure when exhausted.
 */
@Injectable()
export class SourceDiscoveryService {
  private readonly logger = new LoggingService(SourceDiscoveryService.name);

  constructor(private readonly httpService: HttpService) {}

  async discoverEntryPoints(
    baseUrl: string,
    config?: Partial<WebSourceConfig> | null,
  ): Promise<DiscoveryResult> {
    const chain: WebDiscoveryMethod[] = [
      WebDiscoveryMethod.SITEMAP,
      WebDiscoveryMethod.RSS,
      WebDiscoveryMethod.CHEERIO,
    ];

    for (const method of chain) {
      const result = await this.runDiscoveryMethod(method, baseUrl, config);
      if (result.success) return result;
    }

    return this.failure('All deterministic discovery methods failed');
  }

  async runDiscoveryMethod(
    method: WebDiscoveryMethod,
    baseUrl: string,
    config?: Partial<WebSourceConfig> | null,
  ): Promise<DiscoveryResult> {
    switch (method) {
      case WebDiscoveryMethod.SITEMAP:
        return this.discoverViaSitemap(baseUrl);
      case WebDiscoveryMethod.RSS:
      case WebDiscoveryMethod.ATOM:
        return this.discoverViaFeed(baseUrl);
      case WebDiscoveryMethod.CHEERIO:
        return this.discoverViaCheerio(baseUrl, config);
      case WebDiscoveryMethod.PLAYWRIGHT:
        return this.failure('Playwright discovery is out of scope for this phase');
      default:
        return this.failure(`Unknown discovery method: ${method as string}`);
    }
  }

  // ---- Step A + B: robots.txt Sitemap directive, then common sitemap locations ----

  private async discoverViaSitemap(baseUrl: string): Promise<DiscoveryResult> {
    const robotsSitemaps = await this.readRobotsSitemaps(baseUrl);
    const candidates =
      robotsSitemaps.length > 0
        ? robotsSitemaps
        : COMMON_SITEMAP_PATHS.map((path) => new URL(path, baseUrl).toString());

    for (const sitemapUrl of candidates) {
      const items = await this.parseSitemap(sitemapUrl, 0);
      if (items.length > 0) {
        const entryDates: Record<string, string> = {};
        for (const item of items) {
          if (item.lastmod) entryDates[item.url] = item.lastmod;
        }
        return {
          success: true,
          method: WebDiscoveryMethod.SITEMAP,
          entryUrls: items.map((item) => item.url),
          entryDates,
          sitemapUrl,
          confidence: robotsSitemaps.length > 0 ? 'high' : 'medium',
        };
      }
    }

    return this.failure('No usable sitemap found');
  }

  private async readRobotsSitemaps(baseUrl: string): Promise<string[]> {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      const response = await this.httpService.getText(robotsUrl);
      if (response.status !== 200) return [];

      const sitemaps: string[] = [];
      for (const line of response.data.split(/\r?\n/)) {
        const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
        if (match) sitemaps.push(match[1]);
      }
      return Array.from(new Set(sitemaps));
    } catch (err) {
      this.logger.info('robots.txt unavailable, skipping', {
        baseUrl,
        error: (err as Error).message,
      });
      return [];
    }
  }

  private async parseSitemap(sitemapUrl: string, depth: number): Promise<SitemapUrlItem[]> {
    if (depth > MAX_SITEMAP_DEPTH) return [];

    let xmlText: string;
    try {
      const response = await this.httpService.getText(sitemapUrl);
      if (response.status !== 200) return [];
      xmlText = response.data;
    } catch {
      return [];
    }

    let parsed: SitemapXml;
    try {
      parsed = new XMLParser().parse(xmlText) as SitemapXml;
    } catch {
      return [];
    }

    if (parsed.sitemapindex?.sitemap) {
      const nested = this.toArray(parsed.sitemapindex.sitemap)
        .map((entry) => entry.loc)
        .filter((loc): loc is string => typeof loc === 'string')
        .slice(0, MAX_NESTED_SITEMAPS);

      const collected: SitemapUrlItem[] = [];
      for (const nestedUrl of nested) {
        const items = await this.parseSitemap(nestedUrl, depth + 1);
        collected.push(...items);
        if (collected.length >= SITEMAP_SAMPLE_SIZE) break;
      }
      return this.filterArticleUrls(collected).slice(0, SITEMAP_SAMPLE_SIZE);
    }

    if (parsed.urlset?.url) {
      const items = this.toArray(parsed.urlset.url)
        .filter((entry): entry is SitemapEntry & { loc: string } => typeof entry.loc === 'string')
        .map((entry) => ({
          url: entry.loc,
          lastmod: typeof entry.lastmod === 'string' ? entry.lastmod : undefined,
        }));
      return this.filterArticleUrls(items).slice(0, SITEMAP_SAMPLE_SIZE);
    }

    return [];
  }

  private toArray<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value];
  }

  private filterArticleUrls(items: SitemapUrlItem[]): SitemapUrlItem[] {
    const seen = new Set<string>();
    const result: SitemapUrlItem[] = [];
    for (const item of items) {
      if (this.isLikelyArticleUrl(item.url) && !seen.has(item.url)) {
        seen.add(item.url);
        result.push(item);
      }
    }
    return result;
  }

  private isLikelyArticleUrl(rawUrl: string): boolean {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }

    const path = url.pathname.toLowerCase();

    if (JUNK_PATH_FRAGMENTS.some((fragment) => path.includes(fragment))) return false;
    if (/\/page\/\d+\/?$/.test(path)) return false;

    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return false;

    const hasDateSegment = /\/\d{4}\/\d{2}(\/\d{2})?\//.test(path);
    const lastSegment = segments[segments.length - 1];
    const hasSlugSegment = lastSegment.includes('-') && lastSegment.length > 8;

    return hasDateSegment || hasSlugSegment || segments.length >= 2;
  }

  // ---- Step C: RSS/Atom discovery (shared feed validator with SourcesService.create) ----

  private async discoverViaFeed(baseUrl: string): Promise<DiscoveryResult> {
    const candidates = new Set<string>();

    const declared = await this.readDeclaredFeedLinks(baseUrl);
    declared.forEach((url) => candidates.add(url));
    COMMON_FEED_PATHS.forEach((path) => candidates.add(new URL(path, baseUrl).toString()));

    for (const candidate of candidates) {
      const result = await fetchAndValidateFeed(candidate);
      if (result.ok) {
        const method = /<feed[\s>]/i.test(result.rawText)
          ? WebDiscoveryMethod.ATOM
          : WebDiscoveryMethod.RSS;
        return {
          success: true,
          method,
          entryUrls: (result.feed.items ?? [])
            .map((item) => item.link)
            .filter((link): link is string => !!link)
            .slice(0, SITEMAP_SAMPLE_SIZE),
          confidence: 'high',
        };
      }
    }

    return this.failure('No usable RSS/Atom feed found');
  }

  private async readDeclaredFeedLinks(baseUrl: string): Promise<string[]> {
    try {
      const response = await this.httpService.getText(baseUrl);
      if (response.status !== 200) return [];

      const $ = cheerio.load(response.data);
      const links: string[] = [];
      $('link[rel="alternate"]').each((_, el) => {
        const type = $(el).attr('type') ?? '';
        const href = $(el).attr('href');
        if (href && /rss|atom/i.test(type)) {
          try {
            links.push(new URL(href, baseUrl).toString());
          } catch {
            // ignore malformed href
          }
        }
      });
      return links;
    } catch {
      return [];
    }
  }

  // ---- Step D: Cheerio entry-page link discovery ----

  private async discoverViaCheerio(
    baseUrl: string,
    config?: Partial<WebSourceConfig> | null,
  ): Promise<DiscoveryResult> {
    const entryUrls = config?.entryUrls?.length ? config.entryUrls : [baseUrl];
    const allowedHost = new URL(baseUrl).hostname.toLowerCase();

    for (const entryUrl of entryUrls) {
      const found = await this.extractLinksFromListing(
        entryUrl,
        allowedHost,
        config?.articleLinkSelector ?? null,
      );
      if (found.links.length > 0) {
        return {
          success: true,
          method: WebDiscoveryMethod.CHEERIO,
          entryUrls: found.links,
          articleLinkSelector: found.selector,
          confidence: 'medium',
        };
      }
    }

    return this.failure('No article links found via Cheerio link discovery');
  }

  private async extractLinksFromListing(
    entryUrl: string,
    allowedHost: string,
    preferredSelector: string | null,
  ): Promise<{ links: string[]; selector: string | null }> {
    let html: string;
    try {
      const response = await this.httpService.getText(entryUrl);
      if (response.status !== 200) return { links: [], selector: null };
      html = response.data;
    } catch {
      return { links: [], selector: null };
    }

    const $ = cheerio.load(html);
    $(NAV_LIKE_SELECTORS).remove();

    if (preferredSelector) {
      const links = this.collectLinks($, preferredSelector, entryUrl, allowedHost);
      if (links.length > 0)
        return { links: links.slice(0, MAX_CHEERIO_LINKS), selector: preferredSelector };
    }

    const groups = new Map<string, string[]>();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const resolved = this.resolveCandidateLink(href, entryUrl, allowedHost);
      if (!resolved) return;

      const parentSelector = this.buildParentSelector($, el);
      const bucket = groups.get(parentSelector) ?? [];
      bucket.push(resolved);
      groups.set(parentSelector, bucket);
    });

    let bestSelector: string | null = null;
    let bestLinks: string[] = [];
    for (const [selector, links] of groups) {
      const deduped = Array.from(new Set(links));
      if (deduped.length > bestLinks.length) {
        bestSelector = selector;
        bestLinks = deduped;
      }
    }

    if (bestLinks.length >= MIN_LINK_GROUP_SIZE) {
      return { links: bestLinks.slice(0, MAX_CHEERIO_LINKS), selector: bestSelector };
    }

    const allLinks = Array.from(new Set(([] as string[]).concat(...groups.values())));
    return { links: allLinks.slice(0, MAX_CHEERIO_LINKS), selector: null };
  }

  private collectLinks(
    $: CheerioAPI,
    selector: string,
    entryUrl: string,
    allowedHost: string,
  ): string[] {
    const links: string[] = [];
    $(selector).each((_, el) => {
      const href = $(el).attr('href') ?? $(el).find('a[href]').attr('href');
      const resolved = this.resolveCandidateLink(href, entryUrl, allowedHost);
      if (resolved) links.push(resolved);
    });
    return Array.from(new Set(links));
  }

  private resolveCandidateLink(
    href: string | undefined,
    entryUrl: string,
    allowedHost: string,
  ): string | null {
    if (!href) return null;
    if (/^(mailto|tel|javascript):/i.test(href)) return null;
    if (href.startsWith('#')) return null;

    let resolved: URL;
    try {
      resolved = new URL(href, entryUrl);
    } catch {
      return null;
    }

    if (!/^https?:$/.test(resolved.protocol)) return null;
    if (resolved.hostname.toLowerCase() !== allowedHost) return null;

    const normalized = normalizeUrl(resolved.toString());
    return this.isLikelyArticleUrl(normalized) ? normalized : null;
  }

  private buildParentSelector($: CheerioAPI, el: Element): string {
    const parent = $(el).parent();
    const tag = parent.prop('tagName')?.toLowerCase() ?? 'div';
    const className = (parent.attr('class') ?? '').trim().split(/\s+/).filter(Boolean)[0];
    return className ? `${tag}.${className}` : tag;
  }

  private failure(reason: string): DiscoveryResult {
    return { success: false, method: null, entryUrls: [], confidence: 'low', reason };
  }
}
