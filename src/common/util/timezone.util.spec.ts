import {
  addDaysToDateString,
  getLocalDateString,
  zonedEndOfDayExclusiveUTC,
  zonedStartOfDayUTC,
} from './timezone.util';

describe('timezone.util', () => {
  describe('getLocalDateString', () => {
    it('returns a date one day earlier in a negative-offset timezone than in UTC', () => {
      // 2026-07-25T02:00:00Z is still 2026-07-24 evening in America/Los_Angeles (UTC-7 in July).
      const instant = new Date('2026-07-25T02:00:00Z');

      expect(getLocalDateString(instant, 'UTC')).toBe('2026-07-25');
      expect(getLocalDateString(instant, 'America/Los_Angeles')).toBe('2026-07-24');
    });

    it('returns a date one day later in a positive-offset timezone than in UTC', () => {
      // 2026-07-25T22:00:00Z is already 2026-07-26 morning in Asia/Tokyo (UTC+9).
      const instant = new Date('2026-07-25T22:00:00Z');

      expect(getLocalDateString(instant, 'UTC')).toBe('2026-07-25');
      expect(getLocalDateString(instant, 'Asia/Tokyo')).toBe('2026-07-26');
    });
  });

  describe('addDaysToDateString', () => {
    it('adds days across a month boundary', () => {
      expect(addDaysToDateString('2026-07-30', 3)).toBe('2026-08-02');
    });

    it('subtracts days across a year boundary', () => {
      expect(addDaysToDateString('2026-01-02', -3)).toBe('2025-12-30');
    });

    it('is a no-op for a zero delta', () => {
      expect(addDaysToDateString('2026-07-25', 0)).toBe('2026-07-25');
    });
  });

  describe('zonedStartOfDayUTC / zonedEndOfDayExclusiveUTC', () => {
    it('computes local midnight as a later UTC instant for a positive-offset timezone', () => {
      // Asia/Tokyo is UTC+9 — local midnight on 2026-07-25 is 2026-07-24T15:00:00Z.
      const start = zonedStartOfDayUTC('2026-07-25', 'Asia/Tokyo');
      expect(start.toISOString()).toBe('2026-07-24T15:00:00.000Z');
    });

    it('computes local midnight as an earlier UTC instant for a negative-offset timezone', () => {
      // America/New_York is UTC-4 in July (EDT) — local midnight on 2026-07-25 is 2026-07-25T04:00:00Z.
      const start = zonedStartOfDayUTC('2026-07-25', 'America/New_York');
      expect(start.toISOString()).toBe('2026-07-25T04:00:00.000Z');
    });

    it('the exclusive end of a day equals the start of the next day', () => {
      const end = zonedEndOfDayExclusiveUTC('2026-07-25', 'America/New_York');
      const nextDayStart = zonedStartOfDayUTC('2026-07-26', 'America/New_York');
      expect(end.getTime()).toBe(nextDayStart.getTime());
    });

    it('round-trips with getLocalDateString for a range of timezones', () => {
      for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Asia/Kolkata']) {
        const start = zonedStartOfDayUTC('2026-07-25', tz);
        expect(getLocalDateString(start, tz)).toBe('2026-07-25');
      }
    });
  });
});
