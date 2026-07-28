import { plainToInstance } from 'class-transformer';
import { QueryUserDto } from './query-user.dto';

// Regression test for a bug where the global ValidationPipe's `enableImplicitConversion` ran
// class-transformer's own Boolean(value) coercion on this field BEFORE the DTO's @Transform
// decorator, silently overriding it. Boolean('false') is `true` in JavaScript, so an explicit
// `?includeDeleted=false` was inverted to `true`. This test replicates the real ValidationPipe's
// transformOptions exactly (see src/main.ts) rather than relying on plainToInstance defaults,
// since the default-options run was what masked the bug originally.
describe('QueryUserDto boolean query params', () => {
  const transform = (query: Record<string, unknown>): QueryUserDto =>
    plainToInstance(QueryUserDto, query, { enableImplicitConversion: true });

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
