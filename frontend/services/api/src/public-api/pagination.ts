/**
 * Public list pages: `cursor` + `limit` in, `{items, next_cursor}` out. A
 * cursor is the opaque keyset of the page's last item in the owner's order.
 */
import { z } from 'zod';

import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';

const P = policy.public_api.page;

export const pageQuery = {
  cursor: { scalar: { kind: 'str', maxLength: 512 } },
  limit: { scalar: { kind: 'int', ge: 1, le: P.max_limit }, default: P.default_limit },
} as const;

export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), next_cursor: z.string().nullable() });
}

const keysetSchema = z.object({ at: z.string().optional(), id: z.uuid() });
export type Keyset = z.infer<typeof keysetSchema>;

export function encodeCursor(keyset: Keyset): string {
  return Buffer.from(JSON.stringify(keyset), 'utf8').toString('base64url');
}

/** The keyset a cursor names, or 400 `invalid_cursor`. */
export function decodeCursor(cursor: string | null): Keyset | null {
  if (cursor === null || cursor === '') return null;
  try {
    return keysetSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new ApiError(400, 'Invalid cursor', { code: 'invalid_cursor' });
  }
}

/**
 * Page an owner's already-ordered, bounded list by item ID: the page after
 * the cursor's item. A cursor naming an item no longer present is 400.
 */
export function pageAfter<Item extends { id: string }>(
  items: readonly Item[],
  cursor: string | null,
  limit: number,
): { items: Item[]; next_cursor: string | null } {
  const after = decodeCursor(cursor);
  let start = 0;
  if (after !== null) {
    const index = items.findIndex((item) => item.id === after.id);
    if (index < 0) throw new ApiError(400, 'Invalid cursor', { code: 'invalid_cursor' });
    start = index + 1;
  }
  const page = items.slice(start, start + limit);
  const last = page.at(-1);
  return {
    items: page,
    next_cursor:
      last !== undefined && start + limit < items.length ? encodeCursor({ id: last.id }) : null,
  };
}
