import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryFeedDto } from './query-feed.dto';

// Regression test for a bug where the global ValidationPipe's `enableImplicitConversion` ran
// class-transformer's own Boolean(value) coercion on this field BEFORE the DTO's @Transform
// decorator, silently overriding it. Boolean('false') is `true` in JavaScript, so an explicit
// `?saved=false` was inverted to `true`. This test replicates the real ValidationPipe's
// transformOptions exactly (see src/main.ts) rather than relying on plainToInstance defaults,
// since the default-options run was what masked the bug originally.
describe('QueryFeedDto boolean query params', () => {
  const transform = (query: Record<string, unknown>): QueryFeedDto =>
    plainToInstance(QueryFeedDto, query, { enableImplicitConversion: true });

  describe('saved', () => {
    it('defaults to false when the param is omitted', () => {
      expect(transform({}).saved).toBe(false);
    });

    it('parses ?saved=true as true', () => {
      expect(transform({ saved: 'true' }).saved).toBe(true);
    });

    it('parses ?saved=false as false', () => {
      expect(transform({ saved: 'false' }).saved).toBe(false);
    });
  });
});

describe('QueryFeedDto beforeDate', () => {
  const validateDate = async (beforeDate: string) =>
    validate(plainToInstance(QueryFeedDto, { beforeDate }, { enableImplicitConversion: true }));

  it.each(['2024-02-29', '2026-07-25'])('accepts the real calendar date %s', async (value) => {
    await expect(validateDate(value)).resolves.toHaveLength(0);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-04-31', '2026/07/25', 'not-a-date'])(
    'rejects invalid or malformed date %s',
    async (value) => {
      expect(await validateDate(value)).not.toHaveLength(0);
    },
  );
});
