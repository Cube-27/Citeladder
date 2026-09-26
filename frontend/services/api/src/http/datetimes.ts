/**
 * Date and datetime parameters as pydantic-core parses them.
 *
 * FastAPI validates `date` and `datetime` query parameters with speedate in
 * lax mode: an RFC 3339-like string or a Unix timestamp. The error wording is
 * part of the 422 a client receives, so it is reproduced for every branch the
 * parser takes; frozen golden masters record FastAPI's own answers.
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

export type Parsed<T> = { ok: true; value: T } | { ok: false; type: string; message: string };

class SpeedateError extends Error {}

const MESSAGES = {
  tooShort: 'input is too short',
  extra: 'unexpected extra characters at the end of the input',
  dateTimeSep: 'invalid datetime separator, expected `T`, `t`, `_` or space',
  dateSep: 'invalid date separator, expected `-`',
  year: 'invalid character in year',
  month: 'invalid character in month',
  day: 'invalid character in day',
  timeSep: 'invalid time separator, expected `:`',
  hour: 'invalid character in hour',
  minute: 'invalid character in minute',
  second: 'invalid character in second',
  fractionMissing: 'second fraction digits missing after `.`',
  tzSign: 'invalid timezone sign',
  tzHour: 'invalid timezone hour',
  tzMinute: 'invalid timezone minute',
  monthRange: 'month value is outside expected range of 1-12',
  dayRange: 'day value is outside expected range',
  hourRange: 'hour value is outside expected range of 0-23',
  minuteRange: 'minute value is outside expected range of 0-59',
  secondRange: 'second value is outside expected range of 0-59',
  tzMinuteRange: 'timezone minute value is outside expected range of 0-59',
  tzRange: 'timezone offset must be less than 24 hours',
} as const;

const MICROSECONDS_PER_SECOND = 1_000_000n;
const SECONDS_PER_DAY = 86_400;
// speedate reads a larger magnitude as milliseconds.
const MILLISECOND_WATERSHED = 20_000_000_000n;
const I64_MAX = 9_223_372_036_854_775_807n;

// speedate reads UTF-8 bytes: lengths and positions are byte counts.
type Bytes = Uint8Array;

const byte = (character: string) => character.charCodeAt(0);
const isDigit = (code: number | undefined) => code !== undefined && code >= 0x30 && code <= 0x39;

function digits(bytes: Bytes, start: number, count: number, error: string): number {
  let value = 0;
  for (let index = start; index < start + count; index += 1) {
    const code = bytes[index];
    if (!isDigit(code)) throw new SpeedateError(error);
    value = value * 10 + (code! - 0x30);
  }
  return value;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

type DateFields = { year: number; month: number; day: number };

/** The first ten characters as `YYYY-MM-DD`, validated; the rest is ignored. */
function datePart(bytes: Bytes): DateFields {
  if (bytes.length < 10) throw new SpeedateError(MESSAGES.tooShort);
  const year = digits(bytes, 0, 4, MESSAGES.year);
  if (bytes[4] !== byte('-')) throw new SpeedateError(MESSAGES.dateSep);
  const month = digits(bytes, 5, 2, MESSAGES.month);
  if (bytes[7] !== byte('-')) throw new SpeedateError(MESSAGES.dateSep);
  const day = digits(bytes, 8, 2, MESSAGES.day);
  if (month < 1 || month > 12) throw new SpeedateError(MESSAGES.monthRange);
  if (day < 1 || day > daysInMonth(year, month)) throw new SpeedateError(MESSAGES.dayRange);
  return { year, month, day };
}

function fraction(bytes: Bytes, start: number): { microsecond: number; end: number } {
  let index = start;
  let microsecond = 0;
  while (isDigit(bytes[index])) {
    // Digits past the sixth are read and dropped, as pydantic truncates.
    if (index - start < 6) microsecond = microsecond * 10 + (bytes[index]! - 0x30);
    index += 1;
  }
  const count = index - start;
  if (count === 0) throw new SpeedateError(MESSAGES.fractionMissing);
  if (count < 6) microsecond *= 10 ** (6 - count);
  return { microsecond, end: index };
}

function timezone(bytes: Bytes, start: number): { offsetSeconds: number | null; end: number } {
  const sign = bytes[start];
  if (sign === undefined) return { offsetSeconds: null, end: start };
  if (sign === byte('Z') || sign === byte('z')) return { offsetSeconds: 0, end: start + 1 };
  if (sign !== byte('+') && sign !== byte('-')) throw new SpeedateError(MESSAGES.tzSign);
  const hours = digits(bytes, start + 1, 2, MESSAGES.tzHour);
  const colon = bytes[start + 3] === byte(':');
  const minutes = digits(bytes, start + (colon ? 4 : 3), 2, MESSAGES.tzMinute);
  if (minutes > 59) throw new SpeedateError(MESSAGES.tzMinuteRange);
  const total = hours * 3600 + minutes * 60;
  if (total >= SECONDS_PER_DAY) throw new SpeedateError(MESSAGES.tzRange);
  return { offsetSeconds: sign === byte('-') ? -total : total, end: start + (colon ? 6 : 5) };
}

const DATETIME_SEPARATORS = new Set([byte('T'), byte('t'), byte(' '), byte('_')]);

function rfc3339Datetime(bytes: Bytes): ParsedDatetime {
  const date = datePart(bytes);
  if (!DATETIME_SEPARATORS.has(bytes[10] ?? -1)) throw new SpeedateError(MESSAGES.dateTimeSep);
  if (bytes.length - 11 < 5) throw new SpeedateError(MESSAGES.tooShort);
  const hour = digits(bytes, 11, 2, MESSAGES.hour);
  if (bytes[13] !== byte(':')) throw new SpeedateError(MESSAGES.timeSep);
  const minute = digits(bytes, 14, 2, MESSAGES.minute);
  let second = 0;
  let microsecond = 0;
  let end = 16;
  if (bytes[16] === byte(':')) {
    second = digits(bytes, 17, 2, MESSAGES.second);
    end = 19;
    if (bytes[19] === byte('.') || bytes[19] === byte(',')) {
      ({ microsecond, end } = fraction(bytes, 20));
    }
  }
  if (hour > 23) throw new SpeedateError(MESSAGES.hourRange);
  if (minute > 59) throw new SpeedateError(MESSAGES.minuteRange);
  if (second > 59) throw new SpeedateError(MESSAGES.secondRange);
  const zone = timezone(bytes, end);
  if (bytes.length > zone.end) throw new SpeedateError(MESSAGES.extra);
  return { ...date, hour, minute, second, microsecond, offsetSeconds: zone.offsetSeconds };
}

/** A UTC instant in microseconds as its calendar fields. */
function fromEpochMicros(micros: bigint): ParsedDatetime {
  const seconds =
    micros / MICROSECONDS_PER_SECOND - (micros % MICROSECONDS_PER_SECOND < 0n ? 1n : 0n);
  const microsecond = Number(micros - seconds * MICROSECONDS_PER_SECOND);
  const instant = new Date(Number(seconds) * 1000);
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
    hour: instant.getUTCHours(),
    minute: instant.getUTCMinutes(),
    second: instant.getUTCSeconds(),
    microsecond,
    offsetSeconds: 0,
  };
}

/** A timestamp outside the years a `datetime` holds is no timestamp at all. */
function inRange(value: ParsedDatetime): ParsedDatetime | null {
  return Number.isNaN(value.year) || value.year < 1 || value.year > 9999 ? null : value;
}

/** speedate's Unix-timestamp reading of a numeric string, or null. */
function timestamp(text: string): ParsedDatetime | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/u.exec(text);
  if (!match) return null;
  const [, sign, whole = '', decimals] = match;
  const integral = BigInt(whole);
  if (integral > I64_MAX) return null;
  const negative = sign === '-';
  if (decimals === undefined) {
    const value = negative ? -integral : integral;
    const abs = value < 0n ? -value : value;
    if (abs > MILLISECOND_WATERSHED) return inRange(fromEpochMicros(value * 1000n));
    return inRange(fromEpochMicros(value * MICROSECONDS_PER_SECOND));
  }
  const value = Number(`${sign}${whole}.${decimals}`);
  const floor = Math.floor(value);
  const micros = Math.round((value - floor) * 1_000_000);
  if (!Number.isFinite(floor)) return null;
  return inRange(fromEpochMicros(BigInt(floor) * MICROSECONDS_PER_SECOND + BigInt(micros)));
}

const encoder = new TextEncoder();

function parseDatetimeStrict(text: string): ParsedDatetime {
  try {
    return rfc3339Datetime(encoder.encode(text));
  } catch (error) {
    const fallback = timestamp(text);
    if (fallback) return fallback;
    throw error;
  }
}

function parseDateStrict(text: string): DateFields {
  const bytes = encoder.encode(text);
  const date = datePart(bytes);
  if (bytes.length > 10) throw new SpeedateError(MESSAGES.extra);
  return date;
}

function reason(error: unknown): string {
  if (error instanceof SpeedateError) return error.message;
  throw error;
}

const YEAR_ZERO = 'year 0 is out of range';

/** A `datetime` query parameter, falling back to a date at midnight (naive). */
export function parseDatetimeParam(text: string): Parsed<ParsedDatetime> {
  let value: ParsedDatetime;
  try {
    value = parseDatetimeStrict(text);
  } catch (datetimeError) {
    reason(datetimeError);
    try {
      const date = parseDateStrict(text);
      value = { ...date, hour: 0, minute: 0, second: 0, microsecond: 0, offsetSeconds: null };
    } catch (dateError) {
      return {
        ok: false,
        type: 'datetime_from_date_parsing',
        message: `Input should be a valid datetime or date, ${reason(dateError)}`,
      };
    }
  }
  if (value.year === 0) {
    return {
      ok: false,
      type: 'datetime_parsing',
      message: `Input should be a valid datetime, ${YEAR_ZERO}`,
    };
  }
  return { ok: true, value };
}

/** A `date` query parameter, accepting a datetime whose time is exactly zero. */
export function parseDateParam(text: string): Parsed<string> {
  let date: DateFields;
  try {
    date = parseDateStrict(text);
  } catch {
    let value: ParsedDatetime;
    try {
      value = parseDatetimeStrict(text);
    } catch (datetimeError) {
      return {
        ok: false,
        type: 'date_from_datetime_parsing',
        message: `Input should be a valid date or datetime, ${reason(datetimeError)}`,
      };
    }
    if (value.hour || value.minute || value.second || value.microsecond) {
      return {
        ok: false,
        type: 'date_from_datetime_inexact',
        message: 'Datetimes provided to dates should have zero time - e.g. be exact dates',
      };
    }
    date = value;
  }
  if (date.year === 0) {
    return {
      ok: false,
      type: 'date_parsing',
      message: `Input should be a valid date in the format YYYY-MM-DD, ${YEAR_ZERO}`,
    };
  }
  return { ok: true, value: isoDate(date) };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function isoDate(date: DateFields): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}

/** `datetime.isoformat()`. */
export function isoformat(value: ParsedDatetime): string {
  const time = `${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`;
  const micro = value.microsecond ? `.${pad(value.microsecond, 6)}` : '';
  if (value.offsetSeconds === null) return `${isoDate(value)}T${time}${micro}`;
  const sign = value.offsetSeconds < 0 ? '-' : '+';
  const minutes = Math.abs(value.offsetSeconds) / 60;
  return `${isoDate(value)}T${time}${micro}${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Microseconds since the epoch of the value in UTC. A naive value is read as
 * UTC, as the readers' `_to_utc` does.
 */
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
  return fromEpochMicros(epochMicros(value));
}
