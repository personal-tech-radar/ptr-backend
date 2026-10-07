import { adminPeriod } from './admin-period.util';

describe('administration activity windows', () => {
  it('uses UTC midnight for DAU and elapsed-day windows across month boundaries', () => {
    const period = adminPeriod('7d', new Date('2026-03-01T01:30:00+03:00'));
    expect(period.to.toISOString()).toBe('2026-02-28T22:30:00.000Z');
    expect(period.dauFrom.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(period.wauFrom.toISOString()).toBe('2026-02-21T22:30:00.000Z');
    expect(period.mauFrom.toISOString()).toBe('2026-01-29T22:30:00.000Z');
    expect(period.from).toEqual(period.wauFrom);
  });
});
