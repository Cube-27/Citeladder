import { randomUUIDv7 } from 'node:crypto';

/**
 * A time-ordered UUID (v7) for high-volume Site Health rows, so inserts land
 * at the right edge of their key index. It reveals when the row was created
 * and, like every id, never authorizes anything.
 */
export const timeOrderedId = (): string => randomUUIDv7();
