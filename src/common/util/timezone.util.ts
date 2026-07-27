// Pure calendar/timezone helpers built on Intl only — no date-library dependency. Used by
// FeedQueryService for local-day grouping and day-range boundary computation.

// Local calendar date (YYYY-MM-DD) for `date` as observed in `timeZone`.
export function getLocalDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Adds (or, for a negative delta, subtracts) whole calendar days to a YYYY-MM-DD string. Pure
// calendar arithmetic performed in a neutral UTC frame — the string carries no time-of-day or
// timezone component, so there's no DST ambiguity to resolve for this step.
export function addDaysToDateString(dateStr: string, deltaDays: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + deltaDays);
  return utcDate.toISOString().slice(0, 10);
}

// UTC offset (in minutes, "added to UTC to get local time") in effect for `timeZone` at the
// given instant — computed per-instant (via Intl's longOffset), so DST is handled correctly for
// the specific date in question rather than using a fixed year-round offset.
function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = offsetPart.match(/GMT([+-]\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1].startsWith('-') ? -1 : 1;
  const hours = Math.abs(Number(match[1]));
  const minutes = Number(match[2]);
  return sign * (hours * 60 + minutes);
}

// The UTC instant at which local midnight begins for `dateStr` (YYYY-MM-DD) in `timeZone` — the
// inclusive lower bound for "that calendar day" in the user's own timezone. Single-pass offset
// lookup at the UTC-midnight guess; known edge case: a handful of historical zones changed their
// UTC offset at exactly local midnight, which this doesn't iteratively re-resolve — negligible
// for present-day IANA zones and the near-term dates this endpoint actually serves.
export function zonedStartOfDayUTC(dateStr: string, timeZone: string): Date {
  const utcMidnightGuess = new Date(`${dateStr}T00:00:00Z`);
  const offsetMinutes = getTimeZoneOffsetMinutes(utcMidnightGuess, timeZone);
  return new Date(utcMidnightGuess.getTime() - offsetMinutes * 60 * 1000);
}

// Exclusive upper bound for `dateStr`'s calendar day in `timeZone` — i.e. the start of the next
// local day, expressed as a UTC instant.
export function zonedEndOfDayExclusiveUTC(dateStr: string, timeZone: string): Date {
  return zonedStartOfDayUTC(addDaysToDateString(dateStr, 1), timeZone);
}
