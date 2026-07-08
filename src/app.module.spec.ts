// jsdom/@mozilla/readability are mocked at the module boundary, same as
// content-extraction.service.spec.ts and source-candidates.service.spec.ts: jsdom v29's
// dependency tree is ESM-only several levels deep and isn't loadable under this project's
// Jest/ts-jest setup (pre-existing test-infra gap). AppModule pulls ContentExtractionService in
// transitively (SourcesModule -> SourceCandidatesController -> ...), so it hits the same wall.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import {
  QUEUE_ARTICLE_ANALYSIS,
  QUEUE_DIGEST,
  QUEUE_FEED_FETCH,
  QUEUE_WEB_SOURCE_BROWSER_FETCH,
} from './queue/queue.service';

// Proves the Nest DI graph resolves end-to-end, catching regressions like a `forwardRef()`
// accidentally reverted back to a plain import (the SourcesModule <-> ArticlesModule/
// AiAnalysisModule cycle). Deliberately does not boot a real app: TypeOrmModule.forRoot's
// DataSource and BullModule's per-queue Queue instances are eager provider factories that run
// during `compile()` itself (unlike lifecycle hooks such as RedisService.onModuleInit, which
// `compile()` never calls), so they're overridden here with bare stubs just enough to satisfy
// the repository/queue provider factories without opening a real Postgres/Redis connection.
// The module is intentionally never `.close()`d: nothing was actually initialized (no
// onModuleInit ran), so there's nothing to tear down, and `close()` would itself throw by
// invoking onModuleDestroy hooks (e.g. RedisService.onModuleDestroy) against clients that were
// never connected.
describe('AppModule', () => {
  // MailService's constructor eagerly instantiates the Resend SDK, which throws if
  // RESEND_API_KEY is unset. This test resolves the full graph including MailService, so it
  // needs a placeholder value regardless of whether a real key is configured in the environment
  // (CI sets none). This is only about proving the DI graph wires up, not a real API call.
  const originalResendApiKey = process.env.RESEND_API_KEY;

  beforeAll(() => {
    process.env.RESEND_API_KEY = 're_test_dummy_key';
  });

  afterAll(() => {
    process.env.RESEND_API_KEY = originalResendApiKey;
  });

  it('resolves the full DI graph without throwing', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue({
        getRepository: () => ({}),
        entityMetadatas: [],
        manager: {},
        options: { type: 'postgres' },
      })
      .overrideProvider(getQueueToken(QUEUE_FEED_FETCH))
      .useValue({})
      .overrideProvider(getQueueToken(QUEUE_ARTICLE_ANALYSIS))
      .useValue({})
      .overrideProvider(getQueueToken(QUEUE_DIGEST))
      .useValue({})
      .overrideProvider(getQueueToken(QUEUE_WEB_SOURCE_BROWSER_FETCH))
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
  }, 20000);
});
