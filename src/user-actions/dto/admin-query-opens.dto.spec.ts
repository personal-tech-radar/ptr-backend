import { plainToInstance } from 'class-transformer';
import { AdminQueryOpensDto } from './admin-query-opens.dto';

// Regression test for the boolean-query-param coercion bug already fixed 3 times in this program
// (QueryUserDto's includeDeleted, AdminQueryTechnologyInterestDto's includeDeleted, and the
// standalone GET /feed?saved=false fix) — the global ValidationPipe's `enableImplicitConversion`
// runs class-transformer's own Boolean(value) coercion on the field BEFORE the DTO's @Transform
// decorator executes, and Boolean('false') is `true` in JavaScript. This replicates the real
// ValidationPipe's transformOptions exactly (see src/main.ts) rather than relying on
// plainToInstance defaults, since the default-options run is what masked the bug originally.
describe('AdminQueryOpensDto boolean query params', () => {
  const transform = (query: Record<string, unknown>): AdminQueryOpensDto =>
    plainToInstance(AdminQueryOpensDto, query, { enableImplicitConversion: true });

  describe('opened', () => {
    it('is undefined when the param is omitted', () => {
      expect(transform({}).opened).toBeUndefined();
    });

    it('parses ?opened=true as true', () => {
      expect(transform({ opened: 'true' }).opened).toBe(true);
    });

    it('parses ?opened=false as false, not silently coerced to true', () => {
      expect(transform({ opened: 'false' }).opened).toBe(false);
    });
  });
});
