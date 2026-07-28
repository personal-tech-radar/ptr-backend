import { plainToInstance } from 'class-transformer';
import { QuerySourceDto } from './query-source.dto';

// Regression test for a bug where the global ValidationPipe's `enableImplicitConversion` ran
// class-transformer's own Boolean(value) coercion on these fields BEFORE the DTO's @Transform
// decorator, silently overriding it. Boolean('false') is `true` in JavaScript, so an explicit
// `?enabled=false` was inverted to `true`. These tests replicate the real ValidationPipe's
// transformOptions exactly (see src/main.ts) rather than relying on plainToInstance defaults,
// since the default-options run was what masked the bug originally.
describe('QuerySourceDto boolean query params', () => {
  const transform = (query: Record<string, unknown>): QuerySourceDto =>
    plainToInstance(QuerySourceDto, query, { enableImplicitConversion: true });

  describe('enabled', () => {
    it('defaults to undefined when the param is omitted', () => {
      expect(transform({}).enabled).toBeUndefined();
    });

    it('parses ?enabled=true as true', () => {
      expect(transform({ enabled: 'true' }).enabled).toBe(true);
    });

    it('parses ?enabled=false as false', () => {
      expect(transform({ enabled: 'false' }).enabled).toBe(false);
    });
  });

  describe('includeDeleted', () => {
    it('defaults to false when the param is omitted', () => {
      expect(transform({}).includeDeleted).toBe(false);
    });

    it('parses ?includeDeleted=true as true', () => {
      expect(transform({ includeDeleted: 'true' }).includeDeleted).toBe(true);
    });

    it('parses ?includeDeleted=false as false', () => {
      expect(transform({ includeDeleted: 'false' }).includeDeleted).toBe(false);
    });
  });
});
