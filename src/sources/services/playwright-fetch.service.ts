import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';
import { LoggingService } from '../../common/logging/logging.service';

export function isPlaywrightEnabled(): boolean {
  return process.env.PLAYWRIGHT_ENABLED === 'true';
}

export function getPlaywrightTimeoutMs(): number {
  return parseInt(process.env.PLAYWRIGHT_TIMEOUT_MS || '30000', 10);
}

// Not exported — this is the nominal brand key for `ValidatedFetchUrl`. Because the symbol itself
// never leaves this module, no other file can write a matching `[validatedFetchUrlBrand]`
// property, so TypeScript rejects both object-literal construction and a plain `as
// ValidatedFetchUrl` cast (it only accepts `as unknown as ValidatedFetchUrl` / `as any`) anywhere
// outside `toValidatedFetchUrl` below. This is real compiler enforcement, not a naming convention.
const validatedFetchUrlBrand: unique symbol = Symbol('ValidatedFetchUrl');

/**
 * Nominal wrapper so `PlaywrightFetchService.fetchRenderedHtml` cannot be called with a raw
 * string. The only place that constructs one is `SourceDiscoveryService`, and only from a URL
 * that has already passed the discovery chain's allowedHost/robots.txt filtering — the same
 * trusted inputs the rest of the discovery chain (Cheerio link discovery, sitemap parsing)
 * navigates to. Do not add another factory for this type; do not export it for use outside that
 * call site.
 */
export interface ValidatedFetchUrl {
  readonly value: string;
  readonly [validatedFetchUrlBrand]: true;
}

export function toValidatedFetchUrl(url: string): ValidatedFetchUrl {
  return { value: url, [validatedFetchUrlBrand]: true };
}

export interface RenderedPageResult {
  success: boolean;
  html: string | null;
  reason?: string;
}

/**
 * Renders a single, already-validated URL with a bounded headless Chromium context and returns
 * the resulting DOM HTML. This is the last resort in the discovery fallback chain, used only
 * after sitemap/RSS/Cheerio discovery has already failed.
 *
 * PRODUCT/LEGAL CONSTRAINT — do not weaken this, it is not a style preference: this service must
 * never be used to bypass robots.txt directives, paywalls, auth walls, or anti-bot measures. It
 * launches a plain, default-fingerprint Chromium instance with no stealth/evasion plugins, no
 * header spoofing, and no injected cookies/sessions. If a site blocks a plain headless browser,
 * that is the correct, intended outcome for this codebase — do not "fix" it by adding evasion
 * here or anywhere else in this service.
 */
@Injectable()
export class PlaywrightFetchService {
  private readonly logger = new LoggingService(PlaywrightFetchService.name);

  async fetchRenderedHtml(target: ValidatedFetchUrl): Promise<RenderedPageResult> {
    if (!isPlaywrightEnabled()) {
      this.logger.info(
        'Playwright is disabled (PLAYWRIGHT_ENABLED=false), skipping browser fetch',
        { url: target.value },
      );
      return { success: false, html: null, reason: 'playwright_disabled' };
    }

    const timeoutMs = getPlaywrightTimeoutMs();
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(target.value, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
      const html = await page.content();

      return { success: true, html };
    } catch (err) {
      this.logger.error('Playwright render failed', err, { url: target.value });
      return { success: false, html: null, reason: (err as Error).message };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          this.logger.error('Failed to close Playwright browser', closeErr, { url: target.value });
        }
      }
    }
  }
}
