import { SourceDiscoveryService } from './source-discovery.service';
import { HttpService } from '../../common/http/http.service';
import { WebDiscoveryMethod } from '../entities/web-source-config.entity';
import * as feedValidator from '../../common/util/feed-validator.util';

jest.mock('../../common/util/feed-validator.util');

const mockedFetchAndValidateFeed = feedValidator.fetchAndValidateFeed as jest.Mock;

const textResponse = (status: number, data: string) => ({ status, data, headers: {} });

describe('SourceDiscoveryService', () => {
  let service: SourceDiscoveryService;
  const mockHttpService = { getText: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SourceDiscoveryService(mockHttpService as unknown as HttpService);
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
  });

  describe('discoverEntryPoints (full fallback chain)', () => {
    it('reports failure with a reason when every deterministic method fails', async () => {
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
    });
  });
});
