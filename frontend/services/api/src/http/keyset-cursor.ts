/**
 * Typed keyset cursors bound to an endpoint scope and its filters, as
 * `app/domain/site_health/normalization.py` encodes them.
 *
 * The filter fingerprint travels inside the cursor, so a cursor replayed
 * against a different scope or filter set is refused. Python still owns the
 * codec for Site Health; a live golden holds this copy to it, so a cursor
 * issued by either stack reads the same.
 */
import { createHash } from 'node:crypto';

import { parsePyJson, pyJsonDumps, pyStr } from '../python/json.ts';

/** A cursor that is malformed or belongs to another scope or filter set. */
export class InvalidCursorError extends Error {}

/** Deterministic short fingerprint of a scope and its non-empty filters. */
export function filterFingerprint(scope: string, filters: Record<string, unknown>): string {
  const cleaned = Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    ),
  );
  const raw = pyJsonDumps({ s: scope, f: cleaned }, { sortKeys: true, separators: [',', ':'] });
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/** The cursor for the page after the row whose sort values are given. */
export function encodeKeysetCursor(
  scope: string,
  filters: Record<string, unknown>,
  sortValues: readonly string[],
): string {
  const raw = pyJsonDumps(
    { fp: filterFingerprint(scope, filters), k: sortValues },
    { separators: [',', ':'] },
  );
  // `urlsafe_b64encode` keeps its padding.
  return Buffer.from(raw, 'utf8').toString('base64').replaceAll('+', '-').replaceAll('/', '_');
}

/** The cursor's sort values; `InvalidCursorError` when it does not belong here. */
export function decodeKeysetCursor(
  cursor: string,
  scope: string,
  filters: Record<string, unknown>,
): string[] {
  let payload: unknown;
  try {
    if (!/^[A-Za-z0-9_=-]*$/u.test(cursor)) throw new InvalidCursorError('invalid cursor');
    payload = parsePyJson(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError('invalid cursor');
  }
  const record = payload as { fp?: unknown; k?: unknown } | null;
  if (
    record === null ||
    typeof record !== 'object' ||
    !('fp' in record) ||
    !Array.isArray(record.k)
  ) {
    throw new InvalidCursorError('invalid cursor');
  }
  if (pyStr(record.fp) !== filterFingerprint(scope, filters)) {
    throw new InvalidCursorError('cursor does not match the current endpoint filters');
  }
  return record.k.map(pyStr);
}
