/**
 * `jsdom` and `@mozilla/readability` are mocked at the module boundary: jsdom v29's
 * dependency tree is ESM-only several levels deep and is not currently loadable under
 * this project's Jest/ts-jest setup (a pre-existing test-infra gap, unrelated to this
 * feature — the real package works fine at runtime/build, confirmed via plain `node`).
 * These tests verify ContentExtractionService's own ladder/fallback orchestration
 * (JSON-LD -> OpenGraph -> Readability -> configured selector), not Readability's
 * internal parsing fidelity, which is out of scope for a unit test anyway.
 */
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import {
  ContentExtractionService,
  toContentExtractionMethod,
  toWebExtractionMethod,
} from './content-extraction.service';
import { WebExtractionMethod } from '../entities/web-source-config.entity';
import { ContentExtractionMethod } from '../../articles/entities/article.entity';

const MockedJSDOM = JSDOM as unknown as jest.Mock;
const MockedReadability = Readability as unknown as jest.Mock;

describe('ContentExtractionService', () => {
  let service: ContentExtractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    MockedJSDOM.mockImplementation(() => ({ window: { document: {} } }));
    service = new ContentExtractionService();
  });

  describe('extract', () => {
    it('succeeds via JSON-LD when an Article/BlogPosting node is present', () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "BlogPosting", "headline": "JSON-LD Title", "articleBody": "The full article body from structured data." }
        </script>
        </head><body><p>irrelevant</p></body></html>`;

      const result = service.extract(html, 'https://example.com/post');

      expect(result.success).toBe(true);
      expect(result.method).toBe('json_ld');
      expect(result.title).toBe('JSON-LD Title');
      expect(result.content).toBe('The full article body from structured data.');
      expect(MockedReadability).not.toHaveBeenCalled();
    });

    it('surfaces the JSON-LD datePublished as publishedAt', () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "Article", "headline": "Dated Title", "datePublished": "2026-06-20T10:00:00Z" }
        </script>
        </head><body></body></html>`;

      const result = service.extract(html, 'https://example.com/post');

      expect(result.success).toBe(true);
      expect(result.publishedAt).toBe('2026-06-20T10:00:00Z');
    });

    it('finds an Article node nested inside an @graph array', () => {
      const html = `
        <html><head>
        <script type="application/ld+json">
        { "@context": "https://schema.org", "@graph": [ { "@type": "WebPage" }, { "@type": ["Article"], "headline": "Graph Title", "description": "Graph description" } ] }
        </script>
        </head><body></body></html>`;

      const result = service.extract(html, 'https://example.com/post');

      expect(result.success).toBe(true);
      expect(result.method).toBe('json_ld');
      expect(result.title).toBe('Graph Title');
    });

    it('falls back to OpenGraph meta tags when there is no usable JSON-LD', () => {
      const html = `
        <html><head>
        <meta property="og:title" content="OG Fallback Title" />
        <meta property="og:description" content="OG description text" />
        </head><body><p>short</p></body></html>`;

      const result = service.extract(html, 'https://example.com/post');

      expect(result.success).toBe(true);
      expect(result.method).toBe('opengraph');
      expect(result.title).toBe('OG Fallback Title');
      expect(result.content).toBe('OG description text');
      expect(MockedReadability).not.toHaveBeenCalled();
    });

    it('surfaces the OpenGraph article:published_time as publishedAt', () => {
      const html = `
        <html><head>
        <meta property="og:title" content="OG Fallback Title" />
        <meta property="article:published_time" content="2026-06-21T08:30:00Z" />
        </head><body><p>short</p></body></html>`;

      const result = service.extract(html, 'https://example.com/post');

      expect(result.success).toBe(true);
      expect(result.publishedAt).toBe('2026-06-21T08:30:00Z');
    });

    it('falls back to Readability+JSDOM when there is no JSON-LD or OpenGraph', () => {
      MockedReadability.mockImplementation(() => ({
        parse: () => ({
          title: 'Readability Title',
          content: '<p>Full HTML content</p>',
          textContent: 'Full text content extracted by Readability.',
        }),
      }));

      const html = '<html><head></head><body><p>some content the mock ignores</p></body></html>';
      const result = service.extract(html, 'https://example.com/article');

      expect(result.success).toBe(true);
      expect(result.method).toBe('readability');
      expect(result.title).toBe('Readability Title');
      expect(result.textContent).toBe('Full text content extracted by Readability.');
      expect(MockedJSDOM).toHaveBeenCalledWith(html, { url: 'https://example.com/article' });
    });

    it('falls back to the configured CSS selector when Readability produces no usable content', () => {
      MockedReadability.mockImplementation(() => ({
        parse: () => null,
      }));

      const html = `
        <html><head><title>Selector Title</title></head>
        <body><div class="body-copy">Just a short snippet extracted via selector.</div></body></html>`;

      const result = service.extract(html, 'https://example.com/post', '.body-copy');

      expect(result.success).toBe(true);
      expect(result.method).toBe('cheerio_selector');
      expect(result.title).toBe('Selector Title');
      expect(result.textContent).toBe('Just a short snippet extracted via selector.');
    });

    it('reports failure when no method in the ladder produces usable content', () => {
      MockedReadability.mockImplementation(() => ({
        parse: () => null,
      }));

      const html = '<html><head></head><body><div>nothing useful here</div></body></html>';

      const result = service.extract(html, 'https://example.com/post');

      expect(result.success).toBe(false);
      expect(result.method).toBeNull();
      expect(result.title).toBeNull();
    });

    it('does not throw when Readability itself throws, and continues down the ladder', () => {
      MockedReadability.mockImplementation(() => {
        throw new Error('boom');
      });

      const html = `
        <html><head><title>Selector Title</title></head>
        <body><div class="body-copy">Snippet.</div></body></html>`;

      const result = service.extract(html, 'https://example.com/post', '.body-copy');

      expect(result.success).toBe(true);
      expect(result.method).toBe('cheerio_selector');
    });
  });

  describe('method mapping for recipe persistence', () => {
    it('maps readability to the READABILITY enum value', () => {
      expect(toWebExtractionMethod('readability')).toBe(WebExtractionMethod.READABILITY);
      expect(toContentExtractionMethod('readability')).toBe(ContentExtractionMethod.READABILITY);
    });

    it.each(['json_ld', 'opengraph', 'cheerio_selector'] as const)(
      'maps %s to the CHEERIO_SELECTOR enum value',
      (method) => {
        expect(toWebExtractionMethod(method)).toBe(WebExtractionMethod.CHEERIO_SELECTOR);
        expect(toContentExtractionMethod(method)).toBe(ContentExtractionMethod.CHEERIO_SELECTOR);
      },
    );
  });
});
