/**
 * Date and datetime request values at microsecond precision.
 *
 * A JavaScript `Date` holds milliseconds, while PostgreSQL stores and the
 * readers compare microseconds, so a parsed timestamp keeps its wall-clock
 * fields and UTC offset. Accepted shapes are ISO 8601 calendar dates and
 * `YYYY-MM-DD[T ]HH:MM[:SS[.ffffff]][Z|±HH[:]MM]`; a date alone reads as
 * naive midnight, as the Python readers did.
 */

/** A parsed `datetime`: wall-clock fields plus the UTC offset, if any. */
export type ParsedDatetime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  microsecond: number;
  /** Offset from UTC in seconds, or null for a naive value. */
  offsetSeconds: number | null;
};

const MICROSECONDS_PER_SECOND = 1_000_000n;
const SECONDS_PER_DAY = 86_400;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?(?:([Zz])|([+-])(\d{2}):?(\d{2}))?)?$/u;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validDate(year: number, month: number, day: number): boolean {
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** `YYYY-MM-DD` for a real calendar date, or null. */
export function parseDate(text: string): string | null {
  const match = DATE.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1, 4).map(Number) as [number, number, number];
  return validDate(year, month, day) ? text : null;
}

/** Date inputs may carry an ISO midnight; a nonzero time cannot be discarded. */
export function parseRequestDate(text: string): string | null {
  const day = parseDate(text);
  if (day) return day;
  const instant = parseDatetime(text);
  return instant &&
    instant.hour === 0 &&
    instant.minute === 0 &&
    instant.second === 0 &&
    instant.microsecond === 0
    ? text.slice(0, 10)
    : null;
}

export function dateErrorType(value: unknown): string {
  if (typeof value !== 'string') return 'date_type';
  return parseDatetime(value) ? 'date_from_datetime_inexact' : 'date_from_datetime_parsing';
}

/** An ISO date or datetime, or null when it is malformed or out of range. */
export function parseDatetime(text: string): ParsedDatetime | null {
  const match = DATETIME.exec(text);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction, zulu, sign, tzHours, tzMinutes] = match;
  const [year, month, day] = [Number(y), Number(mo), Number(d)];
  const [hour, minute, second] = [Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0)];
  if (!validDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  // Digits past the sixth are dropped, as `datetime` truncates.
  const microsecond = fraction ? Number(fraction.slice(0, 6).padEnd(6, '0')) : 0;
  let offsetSeconds: number | null = null;
  if (zulu) offsetSeconds = 0;
  else if (sign) {
    if (Number(tzMinutes) > 59) return null;
    const total = Number(tzHours) * 3600 + Number(tzMinutes) * 60;
    if (total >= SECONDS_PER_DAY) return null;
    offsetSeconds = sign === '-' ? -total : total;
  }
  return { year, month, day, hour, minute, second, microsecond, offsetSeconds };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** `datetime.isoformat()`. */
export function isoformat(value: ParsedDatetime): string {
  const date = `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}`;
  const time = `${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`;
  const micro = value.microsecond ? `.${pad(value.microsecond, 6)}` : '';
  if (value.offsetSeconds === null) return `${date}T${time}${micro}`;
  const sign = value.offsetSeconds < 0 ? '-' : '+';
  const minutes = Math.abs(value.offsetSeconds) / 60;
  return `${date}T${time}${micro}${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Microseconds since the epoch in UTC; a naive value reads as UTC. */
export function epochMicros(value: ParsedDatetime): bigint {
  // `setUTCFullYear`, because `Date.UTC` reads years 0-99 as 1900-1999.
  const wall = new Date(0);
  wall.setUTCFullYear(value.year, value.month - 1, value.day);
  wall.setUTCHours(value.hour, value.minute, value.second, 0);
  const shifted = BigInt(wall.getTime()) * 1000n + BigInt(value.microsecond);
  return shifted - BigInt(value.offsetSeconds ?? 0) * MICROSECONDS_PER_SECOND;
}

/** The value converted to UTC, as `astimezone(UTC)` would. */
export function toUtc(value: ParsedDatetime): ParsedDatetime {
  const micros = epochMicros(value);
  const seconds =
    micros / MICROSECONDS_PER_SECOND - (micros % MICROSECONDS_PER_SECOND < 0n ? 1n : 0n);
  const instant = new Date(Number(seconds) * 1000);
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
    hour: instant.getUTCHours(),
    minute: instant.getUTCMinutes(),
    second: instant.getUTCSeconds(),
    microsecond: Number(micros - seconds * MICROSECONDS_PER_SECOND),
    offsetSeconds: 0,
  };
}
