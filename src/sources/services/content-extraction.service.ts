import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { LoggingService } from '../../common/logging/logging.service';
import { WebExtractionMethod } from '../entities/web-source-config.entity';
import { ContentExtractionMethod } from '../../articles/entities/article.entity';

export type ExtractionMethod = 'json_ld' | 'opengraph' | 'readability' | 'cheerio_selector';

/**
 * The persisted enums (`WebExtractionMethod`/`ContentExtractionMethod`) only distinguish
 * `readability` from `cheerio_selector` — there is no dedicated slot for JSON-LD or
 * OpenGraph. Both are structured/deterministic (non-heuristic) lookups, so they are
 * recorded under `cheerio_selector` for recipe-persistence purposes; the finer-grained
 * `ExtractionMethod` is still available in the in-memory `ExtractionResult` for logging.
 */
export function toWebExtractionMethod(method: ExtractionMethod): WebExtractionMethod {
  return method === 'readability'
    ? WebExtractionMethod.READABILITY
    : WebExtractionMethod.CHEERIO_SELECTOR;
}

export function toContentExtractionMethod(method: ExtractionMethod): ContentExtractionMethod {
  return method === 'readability'
    ? ContentExtractionMethod.READABILITY
    : ContentExtractionMethod.CHEERIO_SELECTOR;
}

export interface ExtractionResult {
  success: boolean;
  method: ExtractionMethod | null;
  title: string | null;
  content: string | null;
  textContent: string | null;
  // Raw date string as found in structured/meta data (JSON-LD `datePublished`/`dateCreated`,
  // or OpenGraph `article:published_time`); undefined/null when the method has no date signal.
  // Left unparsed here — the caller decides how to parse and what to fall back to.
  publishedAt?: string | null;
  reason?: string;
}

const ARTICLE_JSON_LD_TYPES = new Set(['article', 'blogposting', 'newsarticle', 'techarticle']);

/**
 * Deterministic content-extraction ladder for a fetched article page:
 * JSON-LD Article/BlogPosting -> OpenGraph meta tags -> Readability+JSDOM ->
 * an optionally configured CSS selector. Returns on the first method that
 * yields a usable title. Playwright/LLM extraction is out of scope for this phase.
 */
@Injectable()
export class ContentExtractionService {
  private readonly logger = new LoggingService(ContentExtractionService.name);

  extract(html: string, url: string, articleContentSelector?: string | null): ExtractionResult {
    const viaJsonLd = this.extractViaJsonLd(html);
    if (viaJsonLd.success) return viaJsonLd;

    const viaOpenGraph = this.extractViaOpenGraph(html);
    if (viaOpenGraph.success) return viaOpenGraph;

    const viaReadability = this.extractViaReadability(html, url);
    if (viaReadability.success) return viaReadability;

    if (articleContentSelector) {
      const viaSelector = this.extractViaSelector(html, articleContentSelector);
      if (viaSelector.success) return viaSelector;
    }

    return {
      success: false,
      method: null,
      title: null,
      content: null,
      textContent: null,
      reason: 'No extraction method produced usable content',
    };
  }

  private extractViaJsonLd(html: string): ExtractionResult {
    try {
      const $ = cheerio.load(html);
      const scripts = $('script[type="application/ld+json"]').toArray();

      for (const script of scripts) {
        const raw = $(script).contents().text();
        if (!raw?.trim()) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        const article = this.findArticleNode(parsed);
        if (article) {
          const title = this.asString(article.headline) ?? this.asString(article.name);
          const content =
            this.asString(article.articleBody) ?? this.asString(article.description) ?? null;
          const publishedAt =
            this.asString(article.datePublished) ?? this.asString(article.dateCreated);
          if (title) {
            return {
              success: true,
              method: 'json_ld',
              title,
              content,
              textContent: content,
              publishedAt,
            };
          }
        }
      }
    } catch (err) {
      this.logger.error('JSON-LD extraction failed', err);
    }

    return this.empty('json_ld');
  }

  private findArticleNode(node: unknown, depth = 0): Record<string, unknown> | null {
    if (!node || depth > 4) return null;

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = this.findArticleNode(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const type = obj['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((t) => typeof t === 'string' && ARTICLE_JSON_LD_TYPES.has(t.toLowerCase()))) {
        return obj;
      }
      if (Array.isArray(obj['@graph'])) {
        const found = this.findArticleNode(obj['@graph'], depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  private extractViaOpenGraph(html: string): ExtractionResult {
    try {
      const $ = cheerio.load(html);
      const title = $('meta[property="og:title"]').attr('content')?.trim();
      const description = $('meta[property="og:description"]').attr('content')?.trim();
      const publishedAt = $('meta[property="article:published_time"]').attr('content')?.trim();

      if (title) {
        return {
          success: true,
          method: 'opengraph',
          title,
          content: description ?? null,
          textContent: description ?? null,
          publishedAt: publishedAt || null,
        };
      }
    } catch (err) {
      this.logger.error('OpenGraph extraction failed', err);
    }

    return this.empty('opengraph');
  }

  private extractViaReadability(html: string, url: string): ExtractionResult {
    try {
      const dom = new JSDOM(html, { url });
      const parsed = new Readability(dom.window.document).parse();

      if (parsed?.title && (parsed.textContent?.trim().length ?? 0) > 0) {
        return {
          success: true,
          method: 'readability',
          title: parsed.title,
          content: parsed.content ?? null,
          textContent: parsed.textContent ?? null,
        };
      }
    } catch (err) {
      this.logger.error('Readability extraction failed', err, { url });
    }

    return this.empty('readability');
  }

  private extractViaSelector(html: string, selector: string): ExtractionResult {
    try {
      const $ = cheerio.load(html);
      const node = $(selector).first();
      const textContent = node.text().trim();
      const title = $('title').first().text().trim() || $('h1').first().text().trim();

      if (title && textContent) {
        return {
          success: true,
          method: 'cheerio_selector',
          title,
          content: node.html(),
          textContent,
        };
      }
    } catch (err) {
      this.logger.error('Configured-selector extraction failed', err, { selector });
    }

    return this.empty('cheerio_selector');
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private empty(method: ExtractionMethod): ExtractionResult {
    return { success: false, method, title: null, content: null, textContent: null };
  }
}
