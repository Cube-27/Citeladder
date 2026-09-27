/**
 * Python string semantics the ported readers depend on.
 *
 * JavaScript's `\s`, `trim` and `String()` each differ from Python's
 * `isspace`, `strip` and `repr` at the edges, and those edges decide which
 * brand a mention resolves to or what a served value reads as. Golden
 * masters prove each helper against the Python builtin.
 */
function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

/** Code points for which `str.isspace()` is true. */
const WHITESPACE = new Set([
  ...range(0x09, 0x0d),
  ...range(0x1c, 0x20),
  0x85,
  0xa0,
  0x1680,
  ...range(0x2000, 0x200a),
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
]);

// `str.isprintable()` is false for these categories (the ASCII space aside).
const NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

function isPySpace(character: string): boolean {
  return WHITESPACE.has(character.codePointAt(0)!);
}

/** `str.strip()` with no argument. */
export function pyStrip(value: string): string {
  const characters = [...value];
  let start = 0;
  let end = characters.length;
  while (start < end && isPySpace(characters[start]!)) start += 1;
  while (end > start && isPySpace(characters[end - 1]!)) end -= 1;
  return characters.slice(start, end).join('');
}

/** `" ".join(value.split())`: runs of Python whitespace become one space. */
export function pyCollapseWhitespace(value: string): string {
  const words: string[] = [];
  let word = '';
  for (const character of value) {
    if (!isPySpace(character)) {
      word += character;
    } else if (word) {
      words.push(word);
      word = '';
    }
  }
  if (word) words.push(word);
  return words.join(' ');
}

function escapeCodePoint(codePoint: number): string {
  const [marker, width] = codePoint <= 0xff ? ['x', 2] : codePoint <= 0xffff ? ['u', 4] : ['U', 8];
  return `\\${marker}${codePoint.toString(16).padStart(width, '0')}`;
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = { '\t': '\\t', '\n': '\\n', '\r': '\\r' };

/** `repr(value)` for a `str`, as f-strings' `!r` renders it into messages. */
export function pyRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let body = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (character === quote || character === '\\') body += `\\${character}`;
    else if (character in SIMPLE_ESCAPES) body += SIMPLE_ESCAPES[character];
    else if (codePoint < 0x20 || codePoint === 0x7f) body += escapeCodePoint(codePoint);
    else if (codePoint < 0x80) body += character;
    else if (NON_PRINTABLE.test(character)) body += escapeCodePoint(codePoint);
    else body += character;
  }
  return `${quote}${body}${quote}`;
}

/** Python truthiness of a decoded JSON value. */
export function pyTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

/** The value of one Unicode decimal digit (`\p{Nd}`) as `int()` reads it, or -1. */
function pyDecimalDigit(character: string): number {
  if (!/^\p{Nd}$/u.test(character)) return -1;
  // Decimal digits are encoded as contiguous runs of ten, starting at zero.
  let start = character.codePointAt(0)!;
  while (/^\p{Nd}$/u.test(String.fromCodePoint(start - 1))) start -= 1;
  return (character.codePointAt(0)! - start) % 10;
}

const OUT_OF_RANGE = 'integer exceeds the exact JSON number range';

/**
 * `int(text)` for a `str`, or null where Python raises `ValueError`. The whole
 * string is validated first; accumulation then stops with a `RangeError` as
 * soon as the magnitude passes the exact JSON number range.
 */
function pyIntFromStr(text: string): number | null {
  let body = pyStrip(text);
  let negative = false;
  if (body.startsWith('+') || body.startsWith('-')) {
    negative = body.startsWith('-');
    body = body.slice(1);
  }
  if (!/^\p{Nd}+(?:_\p{Nd}+)*$/u.test(body)) return null;
  let value = 0;
  for (const character of body.replaceAll('_', '')) {
    const digit = pyDecimalDigit(character);
    if (value > (Number.MAX_SAFE_INTEGER - digit) / 10) throw new RangeError(OUT_OF_RANGE);
    value = value * 10 + digit;
  }
  return negative ? -value : value;
}

/**
 * `int(value or 0)` for a decoded JSON value, or null where Python raises.
 *
 * Python's `int` is unbounded, but a served JSON number is exact only up to
 * 2^53. Past that the port refuses the value (a `RangeError`, served as a
 * 500) rather than emitting a rounded count; a JSON number there has already
 * been rounded by decoding, so it is refused the same way.
 */
export function pyIntOrZero(value: unknown): number | null {
  if (!pyTruthy(value)) return 0;
  if (typeof value === 'boolean') return 1;
  if (typeof value === 'string') return pyIntFromStr(value);
  if (typeof value !== 'number') return null;
  const whole = Math.trunc(value);
  if (!Number.isSafeInteger(whole)) throw new RangeError(OUT_OF_RANGE);
  return whole;
}

/**
 * `repr(value)` for a finite JSON number. A decoded JSONB value carries no
 * int/float tag, so an integral number prints as an `int` (JSONB renders
 * `1e16` as `10000000000000000`, which Python also reads as an `int`); only a
 * stored `2.0` would print differently, as `'2.0'`.
 */
function pyNumberRepr(value: number): string {
  return Number.isInteger(value) ? BigInt(value).toString() : pyFloatRepr(value);
}

/** `repr(value)` for a finite number known to be a Python `float` (`30` prints `'30.0'`). */
export function pyFloatRepr(value: number): string {
  const [mantissa, exponent] = value.toExponential().split('e') as [string, string];
  const power = Number(exponent);
  // Python uses scientific notation below 1e-4 and from 1e16; JavaScript below 1e-6 and from 1e21.
  if (power < -4 || power >= 16) {
    return `${mantissa}e${power < 0 ? '-' : '+'}${String(Math.abs(power)).padStart(2, '0')}`;
  }
  const text = Object.is(value, -0) ? '-0' : String(value);
  return Number.isInteger(value) ? `${text}.0` : text;
}

/** `repr(value)` for a decoded JSON value, as Python prints the object it decodes to. */
export function pyReprValue(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return pyNumberRepr(value);
  if (typeof value === 'string') return pyRepr(value);
  if (Array.isArray(value)) return `[${value.map(pyReprValue).join(', ')}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{${entries.map(([key, item]) => `${pyRepr(key)}: ${pyReprValue(item)}`).join(', ')}}`;
}

/** `str(value or "")` for a decoded JSON value: falsy values become the empty string. */
export function pyStrOrEmpty(value: unknown): string {
  if (!pyTruthy(value)) return '';
  return typeof value === 'string' ? value : pyReprValue(value);
}

/** Python's `str` ordering: by code point, where JavaScript compares UTF-16 units. */
export function pyCompare(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}
