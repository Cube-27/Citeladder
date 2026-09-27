/**
 * The two UUID parsers the Python backend applies to request input.
 *
 * `pythonUuid` is `uuid.UUID(value)`, used on the `X-Workspace-Id` header and
 * the session `sub` claim. `pydanticUuid` is pydantic-core's UUID validation
 * of a path or query parameter, with its error wording. They accept
 * different spellings, so each call site uses the one its Python owner used.
 */
import { pyDecimalDigit, pyStrip } from './text.ts';

function canonical(hex: string): string {
  const lower = hex.toLowerCase();
  return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
}

/** The value of one `int(..., 16)` digit, or -1; Unicode decimal digits count. */
function digitValue(character: string): number {
  if (/^[0-9a-f]$/iu.test(character)) return Number.parseInt(character, 16);
  return pyDecimalDigit(character);
}

/** `int(text, 16)` restricted to values that fit a UUID, or null. */
function parseHexInt(text: string): bigint | null {
  let body = pyStrip(text);
  let negative = false;
  if (body.startsWith('+') || body.startsWith('-')) {
    negative = body.startsWith('-');
    body = body.slice(1);
  }
  body = body.replace(/^0x_?/iu, '');
  if (!body || body.startsWith('_') || body.endsWith('_') || body.includes('__')) return null;
  let value = 0n;
  for (const character of body.replaceAll('_', '')) {
    const digit = digitValue(character);
    if (digit < 0) return null;
    value = value * 16n + BigInt(digit);
  }
  if (negative && value !== 0n) return null;
  return value < 1n << 128n ? value : null;
}

/** `str(uuid.UUID(str(value)))`, or null where Python raises `ValueError`. */
export function pythonUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value
    .replaceAll('urn:', '')
    .replaceAll('uuid:', '')
    .replace(/^[{}]+|[{}]+$/gu, '')
    .replaceAll('-', '');
  if ([...hex].length !== 32) return null;
  const parsed = parseHexInt(hex);
  return parsed === null ? null : canonical(parsed.toString(16).padStart(32, '0'));
}

export type UuidParse = { ok: true; value: string } | { ok: false; message: string };

const GROUP_LENGTHS = [8, 4, 4, 4, 12];
const GROUP_STARTS = [0, 9, 14, 19, 24];
const HYPHENATED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function strictShape(text: string): string | null {
  if (/^[0-9a-f]{32}$/iu.test(text)) return text;
  const inner =
    text.startsWith('{') && text.endsWith('}')
      ? text.slice(1, -1)
      : text.startsWith('urn:uuid:')
        ? text.slice('urn:uuid:'.length)
        : text;
  return HYPHENATED.test(inner) ? inner.replaceAll('-', '') : null;
}

/** The uuid crate's diagnosis of a string it could not parse. */
function uuidError(text: string): string {
  let body = text;
  let offset = 0;
  let simple = true;
  if (text.length >= 2 && text.startsWith('{') && text.endsWith('}')) {
    body = text.slice(1, -1);
    offset = 1;
    simple = false;
  } else if (text.startsWith('urn:uuid:')) {
    body = text.slice('urn:uuid:'.length);
    offset = 'urn:uuid:'.length;
    simple = false;
  }
  const bounds: number[] = [];
  let hyphens = 0;
  let index = 0;
  for (const character of body) {
    // Positions are 1-based UTF-8 byte offsets into the original input.
    if (character === '-') {
      if (hyphens < 4) bounds.push(index);
      hyphens += 1;
    } else if (!/^[0-9a-f]$/iu.test(character)) {
      return `invalid character: found \`${character}\` at ${index + offset + 1}`;
    }
    index += new TextEncoder().encode(character).length;
  }
  if (hyphens === 0 && simple) {
    return `invalid length: expected length 32 for simple format, found ${new TextEncoder().encode(text).length}`;
  }
  if (hyphens !== 4) return `invalid group count: expected 5, found ${hyphens + 1}`;
  for (let group = 0; group < 4; group += 1) {
    if (bounds[group] !== GROUP_STARTS[group + 1]! - 1) {
      return `invalid group length in group ${group}: expected ${GROUP_LENGTHS[group]}, found ${bounds[group]! - GROUP_STARTS[group]!}`;
    }
  }
  return `invalid group length in group 4: expected 12, found ${index - GROUP_STARTS[4]!}`;
}

/** pydantic-core's `UUID` validation of a string input. */
export function pydanticUuid(text: string): UuidParse {
  const hex = strictShape(text);
  if (hex !== null) return { ok: true, value: canonical(hex) };
  return { ok: false, message: `Input should be a valid UUID, ${uuidError(text)}` };
}
