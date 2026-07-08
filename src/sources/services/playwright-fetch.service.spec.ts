/**
 * Never launches a real browser. `chromium.launch()` is mocked at the module boundary so these
 * tests only exercise PlaywrightFetchService's own orchestration (kill switch, timeout wiring,
 * context/page lifecycle, error handling) — not Playwright's actual rendering behavior.
 */
const mockPage = { goto: jest.fn(), content: jest.fn() };
const mockContext = { newPage: jest.fn() };
const mockBrowser = { newContext: jest.fn(), close: jest.fn() };
const mockLaunch = jest.fn();

jest.mock('playwright', () => ({
  chromium: { launch: (...args: unknown[]): unknown => mockLaunch(...args) },
}));

import { PlaywrightFetchService, toValidatedFetchUrl } from './playwright-fetch.service';

describe('PlaywrightFetchService', () => {
  let service: PlaywrightFetchService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // `clearAllMocks` only resets call history, not implementations set via `mockResolvedValue`/
    // `mockRejectedValue` in a previous test — use `resetAllMocks` so each test starts from a
    // clean slate and must explicitly configure the behavior it needs.
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    mockLaunch.mockResolvedValue(mockBrowser);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockBrowser.close.mockResolvedValue(undefined);
    mockPage.goto.mockResolvedValue(undefined);
    mockPage.content.mockResolvedValue('<html></html>');
    service = new PlaywrightFetchService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('short-circuits without launching a browser when PLAYWRIGHT_ENABLED is not "true"', async () => {
    delete process.env.PLAYWRIGHT_ENABLED;

    const result = await service.fetchRenderedHtml(toValidatedFetchUrl('https://example.com'));

    expect(result).toEqual({ success: false, html: null, reason: 'playwright_disabled' });
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('launches a bounded context, navigates with the configured timeout, and returns rendered HTML', async () => {
    process.env.PLAYWRIGHT_ENABLED = 'true';
    process.env.PLAYWRIGHT_TIMEOUT_MS = '15000';
    mockPage.content.mockResolvedValue('<html><body>rendered</body></html>');

    const result = await service.fetchRenderedHtml(
      toValidatedFetchUrl('https://example.com/listing'),
    );

    expect(mockLaunch).toHaveBeenCalledWith({ headless: true });
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/listing', {
      timeout: 15000,
      waitUntil: 'domcontentloaded',
    });
    expect(result).toEqual({ success: true, html: '<html><body>rendered</body></html>' });
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser and returns a failure result when navigation throws', async () => {
    process.env.PLAYWRIGHT_ENABLED = 'true';
    mockPage.goto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));

    const result = await service.fetchRenderedHtml(toValidatedFetchUrl('https://example.com'));

    expect(result.success).toBe(false);
    expect(result.html).toBeNull();
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it('still closes the browser when browser.close itself rejects', async () => {
    process.env.PLAYWRIGHT_ENABLED = 'true';
    mockPage.content.mockResolvedValue('<html></html>');
    mockBrowser.close.mockRejectedValue(new Error('close failed'));

    const result = await service.fetchRenderedHtml(toValidatedFetchUrl('https://example.com'));

    expect(result.success).toBe(true);
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });
});
