/** A list that holds at least one item, so its first and last items exist. */
export type NonEmpty<T> = readonly [T, ...T[]];

export function isNonEmpty<T>(items: readonly T[]): items is NonEmpty<T> {
  return items.length > 0;
}

/** The last item of a list that holds at least one. */
export function lastOf<T>(items: NonEmpty<T>): T {
  return items[items.length - 1] ?? items[0];
}

/**
 * The first item of a list the caller's invariant says is non-empty, such as
 * the row an insert returns or the view built for one loaded record. `what`
 * names the expected item, so a broken invariant fails with that name.
 */
export function firstOf<T>(items: readonly T[], what: string): T {
  if (!isNonEmpty(items)) throw new Error(`Expected ${what}`);
  return items[0];
}

/** The item of a one-item list; undefined when the list holds none or several. */
export function onlyOf<T>(items: readonly T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}
