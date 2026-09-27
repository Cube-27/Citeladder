/** zod validation with the published status/code/location/type error contract. */
import type { Context } from 'hono';
import { z } from 'zod';
import { RequestValidationError, type ValidationEntry } from './params.ts';
import { dateErrorType, parseRequestDate } from './datetimes.ts';

const dateFields = new WeakMap<z.ZodType, Set<string>>();

/** Top-level `format: date` fields, derived once per schema. */
function datesOf(schema: z.ZodType): Set<string> {
  let fields = dateFields.get(schema);
  if (!fields) {
    const properties = z.toJSONSchema(schema).properties ?? {};
    fields = new Set(
      Object.entries(properties)
        .filter(([, field]) => typeof field === 'object' && field.format === 'date')
        .map(([key]) => key),
    );
    dateFields.set(schema, fields);
  }
  return fields;
}

export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  const value = await readOptionalBody(c, schema);
  if (value === null)
    throw new RequestValidationError([{ loc: [], message: 'Field required', type: 'missing' }]);
  return value;
}

/** A body FastAPI declares `Model | None = None`: empty or `null` reads as null. */
export async function readOptionalBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.output<T> | null> {
  let value: unknown;
  const raw = await c.req.text();
  if (!raw) return null;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    // Keep the parser's input location, not its runtime-specific wording.
    const position =
      error instanceof SyntaxError ? /position (\d+)/u.exec(error.message)?.[1] : undefined;
    const offset = position === undefined ? raw.length : Number(position);
    throw new RequestValidationError([
      {
        loc: [String([...raw.slice(0, offset)].length)],
        message: 'Invalid JSON',
        type: 'json_invalid',
      },
    ]);
  }
  if (value === null) return null;
  const dates = datesOf(schema);
  const isDate = (key: string) => dates.has(key);
  if (value && typeof value === 'object' && !Array.isArray(value))
    value = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isDate(key) && typeof item === 'string' ? (parseRequestDate(item) ?? item) : item,
      ]),
    );
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const errors: ValidationEntry[] = result.error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys')
      return issue.keys.map((key) => ({
        loc: [...issue.path.map(String), key],
        message: issue.message,
        type: 'extra_forbidden',
      }));
    const at = issue.path.reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<PropertyKey, unknown>)[key]
          : undefined,
      value,
    );
    let type = 'value_error';
    if (at === undefined && issue.path.length > 0) type = 'missing';
    else if (issue.code === 'invalid_type')
      type =
        at === undefined
          ? 'missing'
          : issue.expected === 'object'
            ? 'model_attributes_type'
            : `${issue.expected}_type`;
    else if (issue.code === 'too_small') type = 'string_too_short';
    else if (issue.code === 'too_big') type = 'string_too_long';
    else if (issue.code === 'invalid_format')
      type = issue.format === 'date' ? 'date_from_datetime_parsing' : 'value_error';
    else if (issue.code === 'invalid_value') type = 'literal_error';
    if (
      at !== undefined &&
      isDate(String(issue.path[0])) &&
      (issue.code === 'invalid_type' || issue.code === 'invalid_format')
    )
      type = dateErrorType(at);
    return [{ loc: issue.path.map(String), message: issue.message, type }];
  });
  throw new RequestValidationError(errors);
}
