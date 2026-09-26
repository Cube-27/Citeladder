/**
 * Path and query parameters, validated as FastAPI validates them.
 *
 * A route declares its parameters in FastAPI's order; every failure is
 * collected, path parameters first, and answered with the same 422 envelope
 * `request_validation_error_handler` sends: `code: validation_error`,
 * `details.errors[{loc, message, type}]` and the first error as the message.
 * Repeated keys resolve as Starlette resolves them (the last value; every
 * value for a list), and an empty value is validated, never treated as
 * absent. Frozen golden masters record FastAPI's answers on the real routes.
 */
import { ApiError } from '../errors.ts';
import { isPySpace, pyRepr } from '../python/text.ts';
import { pydanticUuid } from '../python/uuid.ts';
import { parseDateParam, parseDatetimeParam, type ParsedDatetime } from './datetimes.ts';

type Scalar =
  | { kind: 'uuid' }
  | { kind: 'date' }
  | { kind: 'datetime' }
  | { kind: 'int'; ge: number; le: number }
  | { kind: 'str'; minLength?: number; maxLength?: number }
  | { kind: 'literal'; values: readonly string[] };

type ScalarValue<S extends Scalar> = S extends { kind: 'datetime' }
  ? ParsedDatetime
  : S extends { kind: 'int' }
    ? number
    : S extends { kind: 'literal'; values: readonly (infer V)[] }
      ? V
      : string;

export type ParamSpec = {
  scalar: Scalar;
  /** The wire name, when it differs from the parameter name. */
  alias?: string;
  list?: boolean;
  required?: boolean;
  default?: unknown;
};

type SpecValue<P extends ParamSpec> = P extends { list: true }
  ? ScalarValue<P['scalar']>[] | null
  : P extends { required: true }
    ? ScalarValue<P['scalar']>
    : P extends { default: infer D }
      ? ScalarValue<P['scalar']> | Exclude<D, undefined>
      : ScalarValue<P['scalar']> | null;

export type ParamSpecs = Readonly<Record<string, ParamSpec>>;
type ParamValues<Specs extends ParamSpecs> = {
  -readonly [K in keyof Specs]: SpecValue<Specs[K]>;
};

export type ValidationEntry = { loc: string[]; message: string; type: string };

type Outcome = { ok: true; value: unknown } | { ok: false; type: string; message: string };

// Rust's `str::trim`, which pydantic applies to an integer string: Python's
// whitespace less the ASCII separators U+001C..U+001F.
function rustTrim(text: string): string {
  const isTrimmed = (character: string) => {
    const code = character.codePointAt(0)!;
    return isPySpace(character) && !(code >= 0x1c && code <= 0x1f);
  };
  const characters = [...text];
  let start = 0;
  let end = characters.length;
  while (start < end && isTrimmed(characters[start]!)) start += 1;
  while (end > start && isTrimmed(characters[end - 1]!)) end -= 1;
  return characters.slice(start, end).join('');
}

function laxInteger(text: string): number | null {
  let body = rustTrim(text);
  const decimal = body.indexOf('.');
  if (decimal >= 0 && /^0*$/u.test(body.slice(decimal + 1))) body = body.slice(0, decimal);
  if (!/^[+-]?\d+(?:_\d+)*$/u.test(body)) return null;
  return Number(body.replaceAll('_', ''));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function literalMessage(values: readonly string[]): string {
  const quoted = values.map(pyRepr);
  const expected =
    quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}` : quoted[0];
  return `Input should be ${expected}`;
}

function validateScalar(scalar: Scalar, raw: string): Outcome {
  switch (scalar.kind) {
    case 'uuid': {
      const parsed = pydanticUuid(raw);
      return parsed.ok ? parsed : { ok: false, type: 'uuid_parsing', message: parsed.message };
    }
    case 'date':
      return parseDateParam(raw);
    case 'datetime':
      return parseDatetimeParam(raw);
    case 'int': {
      const value = laxInteger(raw);
      if (value === null) {
        return {
          ok: false,
          type: 'int_parsing',
          message: 'Input should be a valid integer, unable to parse string as an integer',
        };
      }
      if (value < scalar.ge) {
        return {
          ok: false,
          type: 'greater_than_equal',
          message: `Input should be greater than or equal to ${scalar.ge}`,
        };
      }
      if (value > scalar.le) {
        return {
          ok: false,
          type: 'less_than_equal',
          message: `Input should be less than or equal to ${scalar.le}`,
        };
      }
      return { ok: true, value };
    }
    case 'str': {
      // Pydantic counts code points, not UTF-16 units.
      const length = [...raw].length;
      if (scalar.minLength !== undefined && length < scalar.minLength) {
        return {
          ok: false,
          type: 'string_too_short',
          message: `String should have at least ${plural(scalar.minLength, 'character')}`,
        };
      }
      if (scalar.maxLength !== undefined && length > scalar.maxLength) {
        return {
          ok: false,
          type: 'string_too_long',
          message: `String should have at most ${plural(scalar.maxLength, 'character')}`,
        };
      }
      return { ok: true, value: raw };
    }
    case 'literal':
      return scalar.values.includes(raw)
        ? { ok: true, value: raw }
        : { ok: false, type: 'literal_error', message: literalMessage(scalar.values) };
  }
}

/** Read one declared parameter from the raw values Starlette would expose. */
function readParam(
  name: string,
  spec: ParamSpec,
  all: (key: string) => string[],
  errors: ValidationEntry[],
): unknown {
  const key = spec.alias ?? name;
  const received = all(key);
  if (received.length === 0) {
    if (spec.required) errors.push({ loc: [key], message: 'Field required', type: 'missing' });
    return spec.default ?? null;
  }
  if (spec.list) {
    const values: unknown[] = [];
    received.forEach((raw, index) => {
      const outcome = validateScalar(spec.scalar, raw);
      if (outcome.ok) values.push(outcome.value);
      else errors.push({ loc: [key, String(index)], message: outcome.message, type: outcome.type });
    });
    return values;
  }
  const outcome = validateScalar(spec.scalar, received.at(-1)!);
  if (outcome.ok) return outcome.value;
  errors.push({ loc: [key], message: outcome.message, type: outcome.type });
  return null;
}

function read<Specs extends ParamSpecs>(
  specs: Specs,
  all: (key: string) => string[],
  errors: ValidationEntry[],
): ParamValues<Specs> {
  const values: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(specs)) {
    values[name] = readParam(name, spec, all, errors);
  }
  return values as ParamValues<Specs>;
}

export class RequestValidationError extends ApiError {
  constructor(errors: ValidationEntry[]) {
    const [first] = errors;
    const message = first ? `${first.loc.join('.')}: ${first.message}` : 'Invalid request';
    super(422, message, { details: { errors }, retryable: false });
  }
}

export type RequestParams<Path extends ParamSpecs, Query extends ParamSpecs> = {
  path: ParamValues<Path>;
  query: ParamValues<Query>;
};

/**
 * Validate one request's path and query parameters, or throw the 422.
 * `search` is the raw query string, decoded as `parse_qsl` decodes it.
 */
export function validateParams<Path extends ParamSpecs, Query extends ParamSpecs>(
  specs: { path: Path; query: Query },
  input: { path: Readonly<Record<string, string>>; search: string },
): RequestParams<Path, Query> {
  const errors: ValidationEntry[] = [];
  const path = read(specs.path, (key) => (key in input.path ? [input.path[key]!] : []), errors);
  const params = new URLSearchParams(input.search);
  const query = read(specs.query, (key) => params.getAll(key), errors);
  if (errors.length > 0) throw new RequestValidationError(errors);
  return { path, query };
}
