import 'reflect-metadata';

/**
 * Same pre-existing Jest/jsdom loading gap noted in content-extraction.service.spec.ts and
 * web-source-fetcher.service.spec.ts: PlaywrightFetchProcessor pulls in WebSourceFetcherService,
 * which pulls in the real ContentExtractionService, which imports `jsdom` at the top level. Mock
 * it out at the module boundary — this test only needs a DI-compatible stand-in.
 */
jest.mock('../../sources/services/content-extraction.service', () => ({
  ContentExtractionService: jest.fn(),
  toContentExtractionMethod: jest.fn((method: string) => method),
  toWebExtractionMethod: jest.fn((method: string) => method),
}));

import { PlaywrightFetchProcessor } from './playwright-fetch.processor';
import { FeedFetchProcessor } from './feed-fetch.processor';
import { ArticleAnalysisProcessor } from '../../ai-analysis/processors/article-analysis.processor';
import {
  PLAYWRIGHT_QUEUE_CONCURRENCY,
  QUEUE_WEB_SOURCE_BROWSER_FETCH,
} from '../../queue/queue.service';

const PROCESSOR_METADATA = 'bullmq:processor_metadata';
const WORKER_METADATA = 'bullmq:worker_metadata';

describe('PlaywrightFetchProcessor queue isolation', () => {
  it('registers on its own queue with its own explicit concurrency, unlike the other processors', () => {
    expect(Reflect.getMetadata(PROCESSOR_METADATA, PlaywrightFetchProcessor)).toEqual({
      name: QUEUE_WEB_SOURCE_BROWSER_FETCH,
    });
    expect(Reflect.getMetadata(WORKER_METADATA, PlaywrightFetchProcessor)).toEqual({
      concurrency: PLAYWRIGHT_QUEUE_CONCURRENCY,
    });

    // feed-fetch and article-analysis were never given explicit worker options — this queue is
    // the first to need its own concurrency ceiling, and it must not silently inherit/share it.
    expect(Reflect.getMetadata(WORKER_METADATA, FeedFetchProcessor)).toBeUndefined();
    expect(Reflect.getMetadata(WORKER_METADATA, ArticleAnalysisProcessor)).toBeUndefined();
  });
});

describe('PlaywrightFetchProcessor', () => {
  let processor: PlaywrightFetchProcessor;
  const mockSourcesService = { findOne: jest.fn() };
  const mockWebSourceFetcherService = { fetchSourceViaBrowser: jest.fn() };
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env = { ...originalEnv };
    processor = new PlaywrightFetchProcessor(
      mockSourcesService as any,
      mockWebSourceFetcherService as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('looks up the source and delegates to fetchSourceViaBrowser for a browser-fetch-source job', async () => {
    const source = { id: 'src-1', name: 'Example Blog' };
    mockSourcesService.findOne.mockResolvedValue(source);
    mockWebSourceFetcherService.fetchSourceViaBrowser.mockResolvedValue(undefined);

    await processor.process({ name: 'browser-fetch-source', data: { sourceId: 'src-1' } } as any);

    expect(mockSourcesService.findOne).toHaveBeenCalledWith('src-1');
    expect(mockWebSourceFetcherService.fetchSourceViaBrowser).toHaveBeenCalledWith(source);
  });

  it('warns and does nothing for an unknown job name', async () => {
    await processor.process({ name: 'not-a-real-job', data: {} } as any);

    expect(mockSourcesService.findOne).not.toHaveBeenCalled();
    expect(mockWebSourceFetcherService.fetchSourceViaBrowser).not.toHaveBeenCalled();
  });

  it('rejects with a hard timeout error if the job hangs past PLAYWRIGHT_TIMEOUT_MS, instead of hanging the worker forever', async () => {
    jest.useFakeTimers();
    process.env.PLAYWRIGHT_TIMEOUT_MS = '1000';
    // Simulates a hung browser fetch: findOne's promise never settles.
    mockSourcesService.findOne.mockImplementation(() => new Promise(() => {}));

    const processPromise = processor.process({
      name: 'browser-fetch-source',
      data: { sourceId: 'src-1' },
    } as any);
    const assertion = expect(processPromise).rejects.toThrow(/timed out after/);

    // PLAYWRIGHT_TIMEOUT_MS (1000) + the processor's own buffer (5000).
    await jest.advanceTimersByTimeAsync(6000);
    await assertion;
  });
});
