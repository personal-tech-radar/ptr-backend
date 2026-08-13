import { getRecencyScore } from './recency-score.util';

describe('getRecencyScore', () => {
  const FRESH_HOURS = 12;
  const RECENT_HOURS = 24;

  it('returns 100 for articles within the fresh window', () => {
    const publishedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);
    expect(getRecencyScore(publishedAt, FRESH_HOURS, RECENT_HOURS)).toBe(100);
  });

  it('returns 80 for articles within the recent window but past fresh', () => {
    const publishedAt = new Date(Date.now() - 18 * 60 * 60 * 1000);
    expect(getRecencyScore(publishedAt, FRESH_HOURS, RECENT_HOURS)).toBe(80);
  });

  it('returns 50 for articles older than the recent window', () => {
    const publishedAt = new Date(Date.now() - 36 * 60 * 60 * 1000);
    expect(getRecencyScore(publishedAt, FRESH_HOURS, RECENT_HOURS)).toBe(50);
  });

  it('returns 50 when publishedAt is null', () => {
    expect(getRecencyScore(null, FRESH_HOURS, RECENT_HOURS)).toBe(50);
  });
});
