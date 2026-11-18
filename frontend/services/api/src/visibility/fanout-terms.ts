/**
 * The persisted per-run fanout facts the Query fanouts table reads (AV-8):
 * which run a one-run selection compares with, and the tracked brands each
 * query names, both written at finalization.
 */
import { storedQueriesSchema } from '../analysis/fanout-terms.ts';
import type { Database } from '../db/database.ts';
import { compareText } from '../text-order.ts';
import type { FanoutResponse } from './fanout.ts';
import { brandIdentities, identityKey } from './brand-identities.ts';
import { selectedRuns, type RunSelection } from './selection.ts';

type Brands = FanoutResponse['items'][number]['brands'];

/** The previous comparable run of a selection that holds exactly one run, or null. */
export async function comparedRunId(db: Database, selection: RunSelection) {
  const [run, other] = await selectedRuns(db, selection).select('audit.id').limit(2).execute();
  if (!run || other) return null;
  const row = await db
    .selectFrom('audit_fanout_terms')
    .select('previous_audit_id')
    .where('workspace_id', '=', selection.workspaceId)
    .where('audit_id', '=', run.id)
    .executeTakeFirst();
  return row?.previous_audit_id ?? null;
}

/**
 * Per query, the tracked brands it names in any of `auditIds`, with their
 * marks. A query reads null when none of those runs counted fanout queries.
 */
export async function queryBrands(
  db: Database,
  selection: RunSelection,
  auditIds: readonly string[],
): Promise<(query: string) => Brands> {
  const rows = auditIds.length
    ? await db
        .selectFrom('audit_fanout_terms')
        .select('terms')
        .where('workspace_id', '=', selection.workspaceId)
        .where('audit_id', 'in', auditIds)
        .execute()
    : [];
  // Rows written before queries were counted whole (word terms) read as not counted.
  const counted = rows.flatMap((row) => {
    const parsed = storedQueriesSchema.safeParse(row.terms);
    return parsed.success ? [parsed.data] : [];
  });
  if (!counted.length) return () => null;
  const named = new Map<string, Map<string, { kind: 'brand' | 'competitor'; name: string }>>();
  for (const entry of counted.flat()) {
    const brands = named.get(entry.query) ?? new Map();
    for (const brand of entry.brands) brands.set(`${brand.kind}\u0000${brand.name}`, brand);
    named.set(entry.query, brands);
  }
  const identities = await brandIdentities(db, selection);
  return (query) =>
    [...(named.get(query)?.values() ?? [])]
      // 'brand' sorts before 'competitor': the brand first, then competitors by name.
      .sort((a, b) => compareText(a.kind, b.kind) || compareText(a.name, b.name))
      .map((brand) => {
        const identity = identities.get(identityKey(brand.name));
        return {
          ...brand,
          logo_url: identity?.logo_url ?? null,
          website: identity?.website ?? null,
        };
      });
}
