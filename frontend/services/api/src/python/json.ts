/**
 * JSON that keeps Python's `int`/`float` distinction.
 *
 * A decoded JSON number has no float tag, so a Python `float` that happens to
 * be whole (`30.0`) decodes to the same JavaScript value as the `int` `30`.
 * PostgreSQL `jsonb` keeps the difference (`30.0` is stored with its scale),
 * so a port that persists evidence Python wrote as a float must say so. A
 * `PyFloat` marks such a value; `pyJson` serializes it the way `json.dumps`
 * does, and `parsePyJson` restores the mark on a value read back as text.
 * Arithmetic stays on plain numbers: the mark is applied where Python built
 * a persisted float, never threaded through a computation.
 */
import { PyFloat, pyCompare, pyFloatRepr, pyReprValue } from './text.ts';

/** `json.dumps` of one Python float (`allow_nan`, whole values keep `.0`). */
function floatJson(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
  return pyFloatRepr(value);
}

type DumpOptions = {
  /** `sort_keys`: keys in Python `str` order. */
  sortKeys?: boolean;
  /** `ensure_ascii`: everything outside printable ASCII escaped. */
  ensureAscii?: boolean;
  /** `separators`; `json.dumps` defaults to `(', ', ': ')`. */
  separators?: readonly [string, string];
};

function stringJson(value: string, ensureAscii: boolean): string {
  const text = JSON.stringify(value);
  // Per UTF-16 unit (no `u` flag), so an astral character becomes the
  // surrogate pair Python writes.
  return ensureAscii
    ? text.replaceAll(
        /[^\x20-\x7e]/g,
        (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`,
      )
    : text;
}

/** `json.dumps(value, ...)` for decoded JSON with Python floats marked. */
export function pyJsonDumps(value: unknown, options: DumpOptions = {}): string {
  const ascii = options.ensureAscii ?? true;
  const [itemSep, keySep] = options.separators ?? [', ', ': '];
  const dump = (item: unknown): string => {
    if (item instanceof PyFloat) return floatJson(item.value);
    if (item === null || item === undefined) return 'null';
    if (typeof item === 'string') return stringJson(item, ascii);
    if (typeof item === 'number') return Number.isInteger(item) ? String(item) : floatJson(item);
    if (typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(dump).join(itemSep)}]`;
    let entries = Object.entries(item as Record<string, unknown>).filter(
      ([, entry]) => entry !== undefined,
    );
    if (options.sortKeys) entries = entries.sort(([a], [b]) => pyCompare(a, b));
    return `{${entries.map(([key, entry]) => `${stringJson(key, ascii)}${keySep}${dump(entry)}`).join(itemSep)}}`;
  };
  return dump(value);
}

/**
 * Compact JSON with Python floats rendered as floats, non-ASCII kept. Key
 * order is the object's own; `jsonb` does not keep it, and the goldens
 * compare it.
 */
export const pyJson = (value: unknown): string =>
  pyJsonDumps(value, { ensureAscii: false, separators: [',', ':'] });

type SourceContext = { source?: string } | undefined;

/**
 * `json.loads` of stored JSON text: a whole number spelled with a fraction
 * or exponent is a Python float and keeps its mark.
 */
export function parsePyJson(text: string): unknown {
  return JSON.parse(text, function (_key, value: unknown, context?: SourceContext) {
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      context?.source !== undefined &&
      /[.eE]/u.test(context.source)
    ) {
      return new PyFloat(value);
    }
    return value;
  });
}

/** A `jsonb` column selected as text (`col::text`), decoded with float marks. */
export function parsePyJsonColumn(text: string | null): unknown {
  return text === null ? null : parsePyJson(text);
}

/** `str(value)` for a value decoded by `parsePyJson`. */
export function pyStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof PyFloat) return pyFloatRepr(value.value);
  return pyReprValue(value);
}
