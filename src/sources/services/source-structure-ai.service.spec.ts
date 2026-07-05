/**
 * Never calls the real OpenAI API. The `openai` package's default export (the `OpenAI` client
 * class) is mocked at the module boundary so `chat.completions.create` is fully controlled here.
 */
const mockCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

import { SourceStructureAiService } from './source-structure-ai.service';
import { HttpService } from '../../common/http/http.service';
import { RedisService } from '../../common/redis/redis.service';
import { SourceDiscoveryService } from './source-discovery.service';
import { PlaywrightFetchService } from './playwright-fetch.service';
import { WebDiscoveryMethod } from '../entities/web-source-config.entity';

const openAiJsonResponse = (payload: unknown) => ({
  choices: [{ message: { content: JSON.stringify(payload) } }],
});

describe('SourceStructureAiService', () => {
  let service: SourceStructureAiService;
  const originalEnv = { ...process.env };

  const mockHttpService = { getText: jest.fn() };
  const mockRedisService = { incr: jest.fn(), expire: jest.fn() };
  const mockSourceDiscoveryService = { runDiscoveryMethod: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.SOURCE_DISCOVERY_AI_FALLBACK_ENABLED = 'true';
    delete process.env.SOURCE_DISCOVERY_AI_FALLBACK_MAX_PER_DAY;

    mockHttpService.getText.mockResolvedValue({ status: 404, data: '', headers: {} });
    mockRedisService.incr.mockResolvedValue(1);
    mockRedisService.expire.mockResolvedValue(1);

    service = new SourceStructureAiService(
      mockHttpService as unknown as HttpService,
      mockRedisService as unknown as RedisService,
      mockSourceDiscoveryService as unknown as SourceDiscoveryService,
    );
    service.onModuleInit();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('SOURCE_DISCOVERY_AI_FALLBACK_ENABLED gating', () => {
    it('returns null without consuming quota or calling OpenAI when disabled', async () => {
      process.env.SOURCE_DISCOVERY_AI_FALLBACK_ENABLED = 'false';

      const result = await service.suggestAndValidate('https://example.com', null, 'chain failed');

      expect(result).toBeNull();
      expect(mockRedisService.incr).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('daily cap (SOURCE_DISCOVERY_AI_FALLBACK_MAX_PER_DAY)', () => {
    it('allows the call and sets a TTL on the first increment of the day', async () => {
      process.env.SOURCE_DISCOVERY_AI_FALLBACK_MAX_PER_DAY = '10';
      mockRedisService.incr.mockResolvedValue(1);
      mockCreate.mockResolvedValue(openAiJsonResponse({ method: 'cheerio' }));
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.CHEERIO,
        entryUrls: ['https://example.com/post'],
        confidence: 'medium',
      });

      await service.suggestAndValidate('https://example.com', null, 'chain failed');

      expect(mockRedisService.expire).toHaveBeenCalledWith(expect.any(String), 60 * 60 * 24);
      expect(mockCreate).toHaveBeenCalled();
    });

    it('does not set a TTL again once the counter is already above 1', async () => {
      process.env.SOURCE_DISCOVERY_AI_FALLBACK_MAX_PER_DAY = '10';
      mockRedisService.incr.mockResolvedValue(2);
      mockCreate.mockResolvedValue(openAiJsonResponse({ method: 'cheerio' }));
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({ success: false });

      await service.suggestAndValidate('https://example.com', null, 'chain failed');

      expect(mockRedisService.expire).not.toHaveBeenCalled();
    });

    it('blocks the call once the daily cap is exceeded, without ever calling OpenAI', async () => {
      process.env.SOURCE_DISCOVERY_AI_FALLBACK_MAX_PER_DAY = '2';
      mockRedisService.incr.mockResolvedValue(3);

      const result = await service.suggestAndValidate('https://example.com', null, 'chain failed');

      expect(result).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('still allows the call at exactly the cap boundary', async () => {
      process.env.SOURCE_DISCOVERY_AI_FALLBACK_MAX_PER_DAY = '2';
      mockRedisService.incr.mockResolvedValue(2);
      mockCreate.mockResolvedValue(openAiJsonResponse({ method: 'cheerio' }));
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({ success: false });

      await service.suggestAndValidate('https://example.com', null, 'chain failed');

      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('mandatory re-validation gate (critical path)', () => {
    it('discards the AI suggestion and returns null when deterministic re-validation fails — it must NOT be persisted', async () => {
      mockCreate.mockResolvedValue(
        openAiJsonResponse({
          method: 'cheerio',
          articleLinkSelector: '.totally-made-up-selector',
          reasoning: 'Looks like a blog listing',
        }),
      );
      // The single most important line in this test file: re-validation is told to FAIL.
      // If the gate in SourceStructureAiService.suggestAndValidate were ever removed or
      // bypassed, this mock would never be consulted and the assertions below would fail.
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'selector matched nothing',
      });

      const result = await service.suggestAndValidate(
        'https://example.com',
        null,
        'deterministic chain exhausted',
      );

      expect(result).toBeNull();
      expect(mockSourceDiscoveryService.runDiscoveryMethod).toHaveBeenCalledWith(
        WebDiscoveryMethod.CHEERIO,
        'https://example.com',
        expect.objectContaining({ articleLinkSelector: '.totally-made-up-selector' }),
      );
    });

    it('returns validated:true with the re-validated result (not the raw AI suggestion) when re-validation succeeds', async () => {
      mockCreate.mockResolvedValue(
        openAiJsonResponse({
          method: 'cheerio',
          articleLinkSelector: '.post-list a',
          reasoning: 'Server-rendered listing',
        }),
      );
      const revalidatedResult = {
        success: true,
        method: WebDiscoveryMethod.CHEERIO,
        entryUrls: ['https://example.com/real-post-1', 'https://example.com/real-post-2'],
        articleLinkSelector: '.post-list a',
        confidence: 'medium',
      };
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue(revalidatedResult);

      const result = await service.suggestAndValidate(
        'https://example.com',
        null,
        'deterministic chain exhausted',
      );

      // Not a whole-object toEqual: ValidatedDiscoverySuggestion carries a non-enumerable-by-name
      // brand symbol (see source-structure-ai.service.ts) that only suggestAndValidate can attach,
      // so the meaningful assertion is on the fields a caller actually reads.
      expect(result?.validated).toBe(true);
      expect(result?.result).toEqual(revalidatedResult);
    });

    it('suggests Playwright re-validation when the AI proposes method "playwright"', async () => {
      mockCreate.mockResolvedValue(
        openAiJsonResponse({ method: 'playwright', articleLinkSelector: '.js-rendered-list a' }),
      );
      mockSourceDiscoveryService.runDiscoveryMethod.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.PLAYWRIGHT,
        entryUrls: ['https://example.com/rendered-post'],
        confidence: 'medium',
      });

      await service.suggestAndValidate('https://example.com', null, 'chain failed');

      expect(mockSourceDiscoveryService.runDiscoveryMethod).toHaveBeenCalledWith(
        WebDiscoveryMethod.PLAYWRIGHT,
        'https://example.com',
        expect.anything(),
      );
    });

    it('returns null (does not throw) when the OpenAI call itself fails', async () => {
      mockCreate.mockRejectedValue(new Error('OpenAI request failed'));

      const result = await service.suggestAndValidate('https://example.com', null, 'chain failed');

      expect(result).toBeNull();
      expect(mockSourceDiscoveryService.runDiscoveryMethod).not.toHaveBeenCalled();
    });
  });

  // Uses a REAL SourceDiscoveryService (only HttpService/PlaywrightFetchService are mocked) so the
  // allowedHost gate in discoverViaCheerio/discoverViaPlaywright actually runs, instead of being
  // short-circuited by the `mockSourceDiscoveryService.runDiscoveryMethod` stub used above. This is
  // the regression test for: an AI-suggested entryUrl on a different host must never be fetched or
  // navigated to, and suggestAndValidate must return null rather than silently falling back.
  describe('AI-suggested entryUrl cannot bypass host allowlisting (real SourceDiscoveryService)', () => {
    const buildServiceWithRealDiscovery = (): {
      service: SourceStructureAiService;
      discoveryHttpService: { getText: jest.Mock };
      playwrightFetchService: { fetchRenderedHtml: jest.Mock };
    } => {
      const discoveryHttpService = {
        getText: jest.fn().mockResolvedValue({ status: 404, data: '', headers: {} }),
      };
      const playwrightFetchService = { fetchRenderedHtml: jest.fn() };
      const realDiscoveryService = new SourceDiscoveryService(
        discoveryHttpService as unknown as HttpService,
        playwrightFetchService as unknown as PlaywrightFetchService,
      );

      const service = new SourceStructureAiService(
        mockHttpService as unknown as HttpService,
        mockRedisService as unknown as RedisService,
        realDiscoveryService,
      );
      service.onModuleInit();

      return { service, discoveryHttpService, playwrightFetchService };
    };

    it('never fetches an AI-suggested entryUrl on a different host via the Cheerio/HTTP path, and returns null', async () => {
      const { service, discoveryHttpService, playwrightFetchService } =
        buildServiceWithRealDiscovery();
      const maliciousUrl = 'https://malicious-other-host.example/listing';

      mockCreate.mockResolvedValue(
        openAiJsonResponse({
          method: 'cheerio',
          entryUrls: [maliciousUrl],
          reasoning: 'The real article listing actually lives on this other domain',
        }),
      );

      const result = await service.suggestAndValidate(
        'https://example.com',
        null,
        'deterministic chain exhausted',
      );

      expect(result).toBeNull();
      expect(discoveryHttpService.getText).not.toHaveBeenCalledWith(maliciousUrl);
      expect(playwrightFetchService.fetchRenderedHtml).not.toHaveBeenCalled();
    });

    it('never navigates Playwright to an AI-suggested entryUrl on a different host, and returns null', async () => {
      const { service, playwrightFetchService } = buildServiceWithRealDiscovery();
      const maliciousUrl = 'https://malicious-other-host.example/listing';

      mockCreate.mockResolvedValue(
        openAiJsonResponse({
          method: 'playwright',
          entryUrls: [maliciousUrl],
          reasoning: 'The JS-rendered listing actually lives on this other domain',
        }),
      );

      const result = await service.suggestAndValidate(
        'https://example.com',
        null,
        'deterministic chain exhausted',
      );

      expect(result).toBeNull();
      expect(playwrightFetchService.fetchRenderedHtml).not.toHaveBeenCalled();
    });
  });
});
