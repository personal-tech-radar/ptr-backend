import { parsePublicationDate } from './publication-date.util';

describe('parsePublicationDate', () => {
  it('parses a valid RSS RFC-822 publication date', () => {
    expect(parsePublicationDate('Sun, 03 Aug 2026 11:00:00 GMT')?.toISOString()).toBe(
      '2026-08-03T11:00:00.000Z',
    );
  });

  it('parses a valid Atom ISO-8601 updated date', () => {
    expect(parsePublicationDate('2026-08-03T11:00:00Z')?.toISOString()).toBe(
      '2026-08-03T11:00:00.000Z',
    );
  });

  it('returns null for a malformed date', () => {
    expect(parsePublicationDate('2026-99-99')).toBeNull();
  });

  it('returns null for an absent date', () => {
    expect(parsePublicationDate(undefined)).toBeNull();
    expect(parsePublicationDate(null)).toBeNull();
  });
});
