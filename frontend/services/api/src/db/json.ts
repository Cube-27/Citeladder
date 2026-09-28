/** Narrow persisted JSON columns to the shapes the views publish. */

/** A JSON object, or `{}` for any other value. */
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** A JSON object's numeric entries. */
export const numberRecord = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );

/** A JSON array's string items, or `[]` for any other value. */
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
