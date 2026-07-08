import { SourceDiscoveryService } from './source-discovery.service';
import { HttpService } from '../../common/http/http.service';
import { PlaywrightFetchService } from './playwright-fetch.service';
import { WebDiscoveryMethod } from '../entities/web-source-config.entity';
import * as feedValidator from '../../common/util/feed-validator.util';

jest.mock('../../common/util/feed-validator.util');

const mockedFetchAndValidateFeed = feedValidator.fetchAndValidateFeed as jest.Mock;

const textResponse = (status: number, data: string) => ({ status, data, headers: {} });

describe('SourceDiscoveryService', () => {
  let service: SourceDiscoveryService;
  const mockHttpService = { getText: jest.fn() };
  const mockPlaywrightFetchService = { fetchRenderedHtml: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlaywrightFetchService.fetchRenderedHtml.mockResolvedValue({
      success: false,
      html: null,
      reason: 'playwright_disabled',
    });
    service = new SourceDiscoveryService(
      mockHttpService as unknown as HttpService,
      mockPlaywrightFetchService as unknown as PlaywrightFetchService,
    );
  });

  describe('sitemap discovery (Step A + B)', () => {
    it('follows a robots.txt Sitemap directive and resolves a sitemap index into article URLs', async () => {
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') {
          return textResponse(
            200,
            'User-agent: *\nSitemap: https://example.com/sitemap_index.xml\n',
          );
        }
        if (url === 'https://example.com/sitemap_index.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><sitemapindex>
              <sitemap><loc>https://example.com/sitemap-posts-1.xml</loc></sitemap>
              <sitemap><loc>https://example.com/sitemap-posts-2.xml</loc></sitemap>
            </sitemapindex>`,
          );
        }
        if (url === 'https://example.com/sitemap-posts-1.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><urlset>
              <url><loc>https://example.com/blog/2024/05/my-first-post</loc></url>
              <url><loc>https://example.com/blog/2024/05/my-second-post</loc></url>
            </urlset>`,
          );
        }
        if (url === 'https://example.com/sitemap-posts-2.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><urlset>
              <url><loc>https://example.com/blog/2024/06/my-third-post</loc></url>
            </urlset>`,
          );
        }
        return textResponse(404, '');
      });

      const result = await service.discoverEntryPoints('https://example.com');

      expect(result.success).toBe(true);
      expect(result.method).toBe(WebDiscoveryMethod.SITEMAP);
      expect(result.confidence).toBe('high');
      expect(result.sitemapUrl).toBe('https://example.com/sitemap_index.xml');
      expect(result.entryUrls).toEqual([
        'https://example.com/blog/2024/05/my-first-post',
        'https://example.com/blog/2024/05/my-second-post',
        'https://example.com/blog/2024/06/my-third-post',
      ]);
    });

    it('captures <lastmod> per URL in entryDates when present', async () => {
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') return textResponse(404, '');
        if (url === 'https://example.com/sitemap.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><urlset>
              <url><loc>https://example.com/blog/dated-post-slug</loc><lastmod>2026-06-15T00:00:00Z</lastmod></url>
              <url><loc>https://example.com/blog/undated-post-slug</loc></url>
            </urlset>`,
          );
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.SITEMAP,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      expect(result.entryDates).toEqual({
        'https://example.com/blog/dated-post-slug': '2026-06-15T00:00:00Z',
      });
    });

    it('falls back to common sitemap paths and parses a normal urlset when robots.txt has no Sitemap directive', async () => {
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') {
          return textResponse(200, 'User-agent: *\nDisallow: /admin\n');
        }
        if (url === 'https://example.com/sitemap.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><urlset>
              <url><loc>https://example.com/blog/an-interesting-post-slug</loc></url>
              <url><loc>https://example.com/tag/nodejs</loc></url>
              <url><loc>https://example.com/blog/page/2</loc></url>
              <url><loc>https://example.com/about</loc></url>
            </urlset>`,
          );
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.SITEMAP,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      expect(result.confidence).toBe('medium');
      // Junk URLs (tag, pagination, static "about" page) are filtered out.
      expect(result.entryUrls).toEqual(['https://example.com/blog/an-interesting-post-slug']);
    });

    it('bounds the sitemap sample to 20 URLs', async () => {
      const urls = Array.from(
        { length: 25 },
        (_, i) => `<url><loc>https://example.com/blog/post-number-${i}-slug</loc></url>`,
      ).join('\n');

      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') return textResponse(404, '');
        if (url === 'https://example.com/sitemap.xml') {
          return textResponse(200, `<?xml version="1.0"?><urlset>${urls}</urlset>`);
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.SITEMAP,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      expect(result.entryUrls).toHaveLength(20);
    });

    it('reports failure when no sitemap can be found at all', async () => {
      mockHttpService.getText.mockResolvedValue(textResponse(404, ''));

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.SITEMAP,
        'https://example.com',
      );

      expect(result.success).toBe(false);
      expect(result.method).toBeNull();
    });

    it('filters out non-article site sections mixed in with genuine articles (real sitemap regression)', async () => {
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') return textResponse(404, '');
        if (url === 'https://example.com/sitemap.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><urlset>
              <url><loc>https://example.com/chronicles/some-great-article-title</loc></url>
              <url><loc>https://example.com/chronicles/another-nice-post-here</loc></url>
              <url><loc>https://example.com/clients/2u</loc></url>
              <url><loc>https://example.com/careers/frontend-engineer</loc></url>
              <url><loc>https://example.com/martians/albert-pazderin</loc></url>
              <url><loc>https://example.com/products/layered-design-book</loc></url>
              <url><loc>https://example.com/services/advisory</loc></url>
            </urlset>`,
          );
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.SITEMAP,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      expect(result.entryUrls).toEqual([
        'https://example.com/chronicles/some-great-article-title',
        'https://example.com/chronicles/another-nice-post-here',
      ]);
    });

    it('rejects a 2-segment URL whose last segment is short and non-dashed (proves the bare segments.length >= 2 fallback is gone)', async () => {
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') return textResponse(404, '');
        if (url === 'https://example.com/sitemap.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><urlset>
              <url><loc>https://example.com/updates/q1</loc></url>
            </urlset>`,
          );
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.SITEMAP,
        'https://example.com',
      );

      // No usable articles survive filtering, so the sitemap step reports failure.
      expect(result.success).toBe(false);
    });

    it('catches a denylisted section even when its slug has 3+ words (denylist is load-bearing on its own)', async () => {
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') return textResponse(404, '');
        if (url === 'https://example.com/sitemap.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><urlset>
              <url><loc>https://example.com/products/layered-design-book</loc></url>
              <url><loc>https://example.com/products/another-great-toolkit</loc></url>
            </urlset>`,
          );
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.SITEMAP,
        'https://example.com',
      );

      expect(result.success).toBe(false);
    });

    it('catches a 2-word slug under a non-denylisted section (tightened slug heuristic is load-bearing on its own)', async () => {
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') return textResponse(404, '');
        if (url === 'https://example.com/sitemap.xml') {
          return textResponse(
            200,
            `<?xml version="1.0"?><urlset>
              <url><loc>https://example.com/martians/albert-pazderin</loc></url>
              <url><loc>https://example.com/martians/irina-nazarova</loc></url>
            </urlset>`,
          );
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.SITEMAP,
        'https://example.com',
      );

      expect(result.success).toBe(false);
    });
  });

  describe('RSS/Atom discovery (Step C, shared with SourcesService.create)', () => {
    it('reuses fetchAndValidateFeed against the declared <link> feed and common paths', async () => {
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com') {
          return textResponse(
            200,
            '<html><head><link rel="alternate" type="application/rss+xml" href="/custom-feed.xml"></head></html>',
          );
        }
        return textResponse(404, '');
      });

      mockedFetchAndValidateFeed.mockImplementation((url: string) => {
        if (url === 'https://example.com/custom-feed.xml') {
          return {
            ok: true,
            feed: { items: [{ link: 'https://example.com/a' }, { link: 'https://example.com/b' }] },
            rawText: '<rss><channel></channel></rss>',
          };
        }
        return { ok: false, reason: 'unreachable', message: 'Feed URL is unreachable' };
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.RSS,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe(WebDiscoveryMethod.RSS);
      expect(result.entryUrls).toEqual(['https://example.com/a', 'https://example.com/b']);
      expect(mockedFetchAndValidateFeed).toHaveBeenCalledWith(
        'https://example.com/custom-feed.xml',
      );
    });

    it('falls back to common feed paths through the same shared validator when no <link> is declared', async () => {
      mockHttpService.getText.mockResolvedValue(textResponse(200, '<html><head></head></html>'));

      mockedFetchAndValidateFeed.mockImplementation((url: string) => {
        if (url === 'https://example.com/feed') {
          return {
            ok: true,
            feed: { items: [{ link: 'https://example.com/a' }] },
            rawText: '<rss><channel></channel></rss>',
          };
        }
        return { ok: false, reason: 'unreachable', message: 'Feed URL is unreachable' };
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.RSS,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      // Common candidate paths go through the exact same fetchAndValidateFeed implementation
      // used by SourcesService.create — no duplicated fetch/parse logic.
      expect(mockedFetchAndValidateFeed).toHaveBeenCalledWith('https://example.com/feed');
    });

    it('classifies the feed as ATOM when the raw response is an Atom <feed> document', async () => {
      mockHttpService.getText.mockResolvedValue(textResponse(200, '<html><head></head></html>'));
      mockedFetchAndValidateFeed.mockImplementation((url: string) => {
        if (url === 'https://example.com/feed') {
          return {
            ok: true,
            feed: { items: [{ link: 'https://example.com/a' }] },
            rawText: '<feed xmlns="http://www.w3.org/2005/Atom"></feed>',
          };
        }
        return { ok: false, reason: 'unreachable', message: 'Feed URL is unreachable' };
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.RSS,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe(WebDiscoveryMethod.ATOM);
    });

    it('reports failure when no candidate feed validates', async () => {
      mockHttpService.getText.mockResolvedValue(textResponse(200, '<html><head></head></html>'));
      mockedFetchAndValidateFeed.mockResolvedValue({
        ok: false,
        reason: 'unreachable',
        message: 'Feed URL is unreachable',
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.RSS,
        'https://example.com',
      );

      expect(result.success).toBe(false);
    });
  });

  describe('Cheerio entry-page link discovery (Step D)', () => {
    it('extracts article links from the largest listing group and filters nav/junk links', async () => {
      const html = `
        <html><body>
          <nav><a href="/about">About</a></nav>
          <div class="listing">
            <a href="/blog/my-article-slug-one">One</a>
            <a href="/blog/my-article-slug-two">Two</a>
            <a href="/blog/my-article-slug-three">Three</a>
            <a href="/tag/nodejs">Tag</a>
            <a href="mailto:hi@example.com">Mail</a>
            <a href="https://external.example/post">External</a>
          </div>
        </body></html>`;

      mockHttpService.getText.mockResolvedValue(textResponse(200, html));

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.CHEERIO,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe(WebDiscoveryMethod.CHEERIO);
      expect(result.entryUrls.sort()).toEqual(
        [
          'https://example.com/blog/my-article-slug-one',
          'https://example.com/blog/my-article-slug-two',
          'https://example.com/blog/my-article-slug-three',
        ].sort(),
      );
      expect(result.articleLinkSelector).toBe('div.listing');
    });

    it('reports failure when the entry page has no qualifying link group', async () => {
      const html = '<html><body><nav><a href="/about">About</a></nav></body></html>';
      mockHttpService.getText.mockResolvedValue(textResponse(200, html));

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.CHEERIO,
        'https://example.com',
      );

      expect(result.success).toBe(false);
    });

    it('discards a config entryUrl on a different host before fetching it — never fetched, result unsuccessful', async () => {
      const maliciousUrl = 'https://malicious-other-host.example/listing';
      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') return textResponse(404, '');
        // If the host check were skipped, this would be fetched and would even "succeed" —
        // proving the guard, not the fetch outcome, is what matters here.
        return textResponse(
          200,
          '<html><body><div class="listing"><a href="/a">1</a><a href="/b">2</a><a href="/c">3</a></div></body></html>',
        );
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.CHEERIO,
        'https://example.com',
        { entryUrls: [maliciousUrl] },
      );

      expect(result.success).toBe(false);
      expect(mockHttpService.getText).not.toHaveBeenCalledWith(maliciousUrl);
    });

    it('filters out a denylisted-section link mixed in with genuine article links on a listing page', async () => {
      const html = `
        <html><body>
          <div class="listing">
            <a href="/chronicles/some-great-article-title">One</a>
            <a href="/chronicles/another-nice-post-here">Two</a>
            <a href="/careers/some-role">Careers</a>
          </div>
        </body></html>`;

      mockHttpService.getText.mockResolvedValue(textResponse(200, html));

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.CHEERIO,
        'https://example.com',
      );

      expect(result.success).toBe(true);
      expect(result.entryUrls.sort()).toEqual(
        [
          'https://example.com/chronicles/some-great-article-title',
          'https://example.com/chronicles/another-nice-post-here',
        ].sort(),
      );
    });
  });

  describe('Playwright-rendered link discovery (Step E)', () => {
    it('extracts article links from Playwright-rendered HTML using the same link-grouping logic as Cheerio', async () => {
      mockPlaywrightFetchService.fetchRenderedHtml.mockResolvedValue({
        success: true,
        html: `
          <html><body>
            <div class="listing">
              <a href="/blog/rendered-article-one">One</a>
              <a href="/blog/rendered-article-two">Two</a>
              <a href="/blog/rendered-article-three">Three</a>
            </div>
          </body></html>`,
      });

      const result = await service.discoverViaPlaywright('https://example.com');

      expect(result.success).toBe(true);
      expect(result.method).toBe(WebDiscoveryMethod.PLAYWRIGHT);
      expect(result.entryUrls.sort()).toEqual(
        [
          'https://example.com/blog/rendered-article-one',
          'https://example.com/blog/rendered-article-two',
          'https://example.com/blog/rendered-article-three',
        ].sort(),
      );
    });

    it('reports failure when Playwright is disabled or the render fails', async () => {
      mockPlaywrightFetchService.fetchRenderedHtml.mockResolvedValue({
        success: false,
        html: null,
        reason: 'playwright_disabled',
      });

      const result = await service.discoverViaPlaywright('https://example.com');

      expect(result.success).toBe(false);
    });

    it('discards a config entryUrl on a different host before navigating to it — never navigated, result unsuccessful', async () => {
      mockHttpService.getText.mockResolvedValue(textResponse(404, ''));

      const result = await service.discoverViaPlaywright('https://example.com', {
        entryUrls: ['https://malicious-other-host.example/listing'],
      });

      expect(result.success).toBe(false);
      expect(mockPlaywrightFetchService.fetchRenderedHtml).not.toHaveBeenCalled();
    });
  });

  describe('robots.txt Disallow enforcement', () => {
    it('skips an entryUrl under a disallowed path without fetching it, while an allowed entryUrl proceeds normally', async () => {
      const disallowedUrl = 'https://example.com/private-section/listing';
      const allowedUrl = 'https://example.com/blog/listing';
      const listingHtml = `
        <html><body>
          <div class="listing">
            <a href="/blog/first-article-slug">One</a>
            <a href="/blog/second-article-slug">Two</a>
            <a href="/blog/third-article-slug">Three</a>
          </div>
        </body></html>`;

      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') {
          return textResponse(200, 'User-agent: *\nDisallow: /private-section\n');
        }
        if (url === disallowedUrl) {
          throw new Error('must not be fetched: path is disallowed by robots.txt');
        }
        if (url === allowedUrl) {
          return textResponse(200, listingHtml);
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.CHEERIO,
        'https://example.com',
        { entryUrls: [disallowedUrl, allowedUrl] },
      );

      expect(result.success).toBe(true);
      expect(mockHttpService.getText).not.toHaveBeenCalledWith(disallowedUrl);
      expect(mockHttpService.getText).toHaveBeenCalledWith(allowedUrl);
    });

    it('fails discovery when the only entryUrl is disallowed by robots.txt', async () => {
      const disallowedUrl = 'https://example.com/private-section/listing';

      mockHttpService.getText.mockImplementation((url: string) => {
        if (url === 'https://example.com/robots.txt') {
          return textResponse(200, 'User-agent: *\nDisallow: /private-section\n');
        }
        if (url === disallowedUrl) {
          throw new Error('must not be fetched: path is disallowed by robots.txt');
        }
        return textResponse(404, '');
      });

      const result = await service.runDiscoveryMethod(
        WebDiscoveryMethod.CHEERIO,
        'https://example.com',
        { entryUrls: [disallowedUrl] },
      );

      expect(result.success).toBe(false);
      expect(mockHttpService.getText).not.toHaveBeenCalledWith(disallowedUrl);
    });
  });

  describe('discoverEntryPoints (full fallback chain)', () => {
    it('reports failure with a reason when every deterministic method and Playwright fail', async () => {
      mockHttpService.getText.mockResolvedValue(textResponse(404, ''));
      mockedFetchAndValidateFeed.mockResolvedValue({
        ok: false,
        reason: 'unreachable',
        message: 'Feed URL is unreachable',
      });

      const result = await service.discoverEntryPoints('https://example.com');

      expect(result.success).toBe(false);
      expect(result.method).toBeNull();
      expect(result.reason).toBeTruthy();
      expect(mockPlaywrightFetchService.fetchRenderedHtml).toHaveBeenCalled();
    });

    it('reports browserFallbackAvailable instead of running Playwright when browserFallback is disabled', async () => {
      mockHttpService.getText.mockResolvedValue(textResponse(404, ''));
      mockedFetchAndValidateFeed.mockResolvedValue({
        ok: false,
        reason: 'unreachable',
        message: 'Feed URL is unreachable',
      });

      const result = await service.discoverEntryPoints('https://example.com', null, {
        browserFallback: 'disabled',
      });

      expect(result.success).toBe(false);
      expect(result.browserFallbackAvailable).toBe(true);
      expect(mockPlaywrightFetchService.fetchRenderedHtml).not.toHaveBeenCalled();
    });
  });
});
