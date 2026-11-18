/** The Search terms card: the newest selected run's persisted fanout terms (AV-8). */
import type { visibilityFanoutTermsSchema } from '@citeladder/contracts/visibility-evidence';
import { sql } from 'kysely';
import type { z } from 'zod';
import { storedTermsSchema, type FanoutTerm } from '../analysis/fanout-terms.ts';
import { answerEvidence } from '../config/answer-evidence.ts';
import type { Database } from '../db/database.ts';
import { compareText } from '../text-order.ts';
import { brandIdentities, identityKey } from './brand-identities.ts';
import { authorizedSelection, selectedRuns, type RunSelection } from './selection.ts';

type Response = z.input<typeof visibilityFanoutTermsSchema>;
const LIMIT = answerEvidence.fanout_terms.list_limit;

/** Rising: largest share gain first; falling: largest loss first; ties by term. */
function moved(terms: readonly FanoutTerm[], direction: 1 | -1) {
  return terms
    .filter((t) => t.change !== null && t.change * direction > 0)
    .sort((a, b) => ((b.change ?? 0) - (a.change ?? 0)) * direction || compareText(a.term, b.term))
    .slice(0, LIMIT);
}

export async function getVisibilityFanoutTerms(
  db: Database,
  requested: RunSelection,
): Promise<Response> {
  const selection = await authorizedSelection(db, requested);
  const run = await selectedRuns(db, selection)
    .leftJoin('audit_fanout_terms as t', (join) =>
      join.onRef('t.audit_id', '=', 'audit.id').on('t.workspace_id', '=', selection.workspaceId),
    )
    .select([
      'audit.id as audit_id',
      't.total_searches',
      't.previous_audit_id',
      't.unreported_engines',
      't.terms',
    ])
    .orderBy(sql`audit.completed_at desc nulls last`)
    .orderBy('audit.created_at', 'desc')
    .orderBy('audit.id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!run) return { kind: 'not_run' };
  if (run.total_searches === null || run.unreported_engines === null)
    return { kind: 'unavailable', audit_id: run.audit_id };
  const terms = storedTermsSchema.parse(run.terms);
  const identities = await brandIdentities(db, selection);
  const row = (term: FanoutTerm) => ({
    ...term,
    brands: term.brands.map((brand) => {
      const identity = identities.get(identityKey(brand.name));
      return { ...brand, logo_url: identity?.logo_url ?? null, website: identity?.website ?? null };
    }),
  });
  return {
    kind: 'observed',
    audit_id: run.audit_id,
    total_searches: run.total_searches,
    compared: run.previous_audit_id !== null,
    unreported_engines: run.unreported_engines,
    top: terms
      .filter((t) => t.searches > 0)
      .slice(0, LIMIT)
      .map(row),
    rising: moved(terms, 1).map(row),
    falling: moved(terms, -1).map(row),
  };
}
