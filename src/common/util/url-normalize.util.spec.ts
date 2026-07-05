import { normalizeUrl } from './url-normalize.util';

describe('normalizeUrl', () => {
  it('strips UTM and common tracking query params', () => {
    const result = normalizeUrl(
      'https://example.com/post?utm_source=twitter&utm_medium=social&fbclid=abc&gclid=xyz&keep=1',
    );
    expect(result).toBe('https://example.com/post?keep=1');
  });

  it('strips the URL fragment', () => {
    expect(normalizeUrl('https://example.com/post#section-2')).toBe('https://example.com/post');
  });

  it('prefers the canonical URL when provided', () => {
    const result = normalizeUrl(
      'https://example.com/amp/post?utm_source=x',
      'https://example.com/post',
    );
    expect(result).toBe('https://example.com/post');
  });

  it('falls back to the raw URL when no canonical URL is given', () => {
    expect(normalizeUrl('https://example.com/post', null)).toBe('https://example.com/post');
  });

  it('lowercases the hostname', () => {
    expect(normalizeUrl('https://EXAMPLE.com/Post')).toBe('https://example.com/Post');
  });

  it('strips a trailing slash but keeps the root path intact', () => {
    expect(normalizeUrl('https://example.com/post/')).toBe('https://example.com/post');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('leaves non-tracking query params and their order alone via sorted output', () => {
    expect(normalizeUrl('https://example.com/post?b=2&a=1')).toBe(
      'https://example.com/post?a=1&b=2',
    );
  });

  it('returns the original raw URL unchanged when it cannot be parsed', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});
