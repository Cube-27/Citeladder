/**
 * Evidence-backed competitor suggestions from completed audits.
 *
 * The audit projection records candidates, a cited domain or a name the
 * answers used; a person accepts one here, which adds (or reuses) a tracked
 * competitor, or rejects it, which keeps later audits from suggesting it
 * again. Either decision records who made it and when, on every pending row
 * of that domain or name. Accepts take the project row lock before the
 * candidate row, so concurrent accepts cannot both add a competitor past the
 * project ceiling or duplicate one.
 */
import { competitorSchema } from '@citeladder/contracts/project';
import { observedCompetitorSchema } from '@citeladder/contracts/visibility';
import type { Selectable } from 'kysely';
import { z } from 'zod';

import { domainMatches } from '../analysis/domains.ts';
import { lockSuggestions, suggestionRows } from '../analysis/observed-competitors.ts';
import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import type { ObservedEntityCandidates } from '../generated/db-schema.ts';
import { isTracked } from '../perception/untracked-names.ts';
import { compareText } from '../text-order.ts';
import { competitorView, insertCompetitor, lockProject } from './competitors.ts';
import type { ProjectScope } from './brand-profile.ts';

type Suggestion = z.input<typeof observedCompetitorSchema>;
type Competitor = z.input<typeof competitorSchema>;
type Row = Selectable<ObservedEntityCandidates>;
/** A person's decision on a suggestion, as the route's actor makes it. */
type Decision = ProjectScope & { userId: string };

const {
  status_pending: PENDING,
  status_accepted: ACCEPTED,
  status_rejected: REJECTED,
} = policy.audits.observed_competitors;
const ids = z.array(z.string());
const strings = z.array(z.string());

/** The variant a stored row is; the table's check keeps kind and key consistent. */
function view(row: Row): Suggestion {
  const shared = {
    id: row.id,
    audit_id: row.audit_id,
    name: row.name,
    qualification_reason: row.qualification_reason,
    prompt_count: row.prompt_count,
    engine_count: row.engine_count,
    engine_total: row.engine_total,
    market_relevant: row.market_relevant,
    analyzer_version: row.analyzer_version,
    source_analysis_ids: ids.parse(row.source_analysis_ids),
    source_artifact_ids: ids.parse(row.source_artifact_ids),
    status: row.status,
    created_at: row.created_at.toISOString(),
  };
  if (row.kind === 'named_in_answers') return { ...shared, kind: 'named_in_answers' };
  if (row.kind === 'cited_domain' && row.domain !== null)
    return {
      ...shared,
      kind: 'cited_domain',
      domain: row.domain,
      citation_count: row.citation_count,
    };
  throw new Error(`Competitor suggestion ${row.id} has an unknown kind`);
}

/** The domain or name a suggestion stands for, the same across audits. */
const keyOf = (row: Pick<Row, 'kind' | 'domain' | 'name_key'>) =>
  `${row.kind}:${row.domain ?? row.name_key ?? ''}`;

type RosterRow = { name: string; aliases: unknown; domains: unknown };

/** Whether a tracked competitor already stands for the candidate, by name, alias or domain. */
function tracks(row: RosterRow, candidate: Pick<Row, 'name' | 'domain'>): boolean {
  const { domain } = candidate;
  return (
    isTracked(candidate.name, [{ name: row.name, aliases: strings.parse(row.aliases) }]) ||
    (domain !== null && strings.parse(row.domains).some((own) => domainMatches(domain, own)))
  );
}

/**
 * Pending suggestions, one per domain or name (its latest audit's), strongest
 * first. One the roster now tracks (added by hand, or an alias since) is left out.
 */
export async function listSuggestions(db: Database, scope: ProjectScope): Promise<Suggestion[]> {
  const [rows, roster] = await Promise.all([
    suggestionRows(db, scope)
      .selectAll()
      .where('status', '=', PENDING)
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('competitors')
      .select(['name', 'aliases', 'domains'])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .execute(),
  ]);
  const latest = new Map<string, Row>();
  for (const row of rows) if (!latest.has(keyOf(row))) latest.set(keyOf(row), row);
  return [...latest.values()]
    .filter((row) => !roster.some((competitor) => tracks(competitor, row)))
    .sort(
      (a, b) =>
        b.prompt_count - a.prompt_count ||
        b.engine_count - a.engine_count ||
        compareText(a.domain ?? a.name, b.domain ?? b.name) ||
        compareText(a.id, b.id),
    )
    .map(view);
}

/** The candidate under the transaction's locks, or 404 outside the project. */
async function lockedCandidate(trx: Database, scope: ProjectScope, candidateId: string) {
  await lockSuggestions(trx, scope);
  const candidate = await suggestionRows(trx, scope)
    .select(['id', 'name', 'kind', 'domain', 'name_key', 'status'])
    .where('id', '=', candidateId)
    .forUpdate()
    .executeTakeFirst();
  if (candidate === undefined) throw notFound('Competitor suggestion');
  return candidate;
}

/** Record the decision on every pending row of the candidate's domain or name. */
function decide(
  trx: Database,
  decision: Decision,
  candidate: Pick<Row, 'kind' | 'domain' | 'name_key'>,
  status: string,
) {
  let rows = suggestionRows(trx, decision)
    .where('kind', '=', candidate.kind)
    .where('status', '=', PENDING);
  rows =
    candidate.domain === null
      ? rows.where('name_key', '=', candidate.name_key)
      : rows.where('domain', '=', candidate.domain);
  return trx
    .updateTable('observed_entity_candidates')
    .set({ status, decided_by_user_id: decision.userId, decided_at: new Date() })
    .where('id', 'in', rows.select('id'))
    .execute();
}

/**
 * Track the suggested competitor: an existing competitor with the same name,
 * alias or domain is reused, otherwise one is added within the project ceiling.
 */
export function acceptSuggestion(
  db: Database,
  decision: Decision,
  candidateId: string,
): Promise<Competitor> {
  return inTransaction(db, async (trx) => {
    await lockProject(trx, decision);
    const candidate = await lockedCandidate(trx, decision, candidateId);
    if (candidate.status === REJECTED)
      throw new ApiError(409, 'This suggestion was rejected; add the competitor instead');
    const competitors = await trx
      .selectFrom('competitors')
      .select(['id', 'name', 'aliases', 'domains', 'logo_asset_id'])
      .where('workspace_id', '=', decision.workspaceId)
      .where('project_id', '=', decision.projectId)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    const competitor =
      competitors.find((row) => tracks(row, candidate)) ??
      (await insertCompetitor(trx, {
        scope: decision,
        tracked: competitors.length,
        fields: {
          name: candidate.name,
          aliases: [candidate.name],
          domains: candidate.domain === null ? [] : [candidate.domain],
        },
      }));
    await decide(trx, decision, candidate, ACCEPTED);
    return competitorView(decision.projectId, competitor);
  });
}

/**
 * Reject the suggestion, returned as rejected; later audits never suggest its
 * domain or name again. Rejecting twice keeps the first decision.
 */
export function rejectSuggestion(
  db: Database,
  decision: Decision,
  candidateId: string,
): Promise<Suggestion> {
  return inTransaction(db, async (trx) => {
    // The project lock first, as accept takes it: both update every row of a key.
    await lockProject(trx, decision);
    const candidate = await lockedCandidate(trx, decision, candidateId);
    if (candidate.status === ACCEPTED)
      throw new ApiError(409, 'This suggestion was accepted; remove the competitor instead');
    if (candidate.status !== REJECTED) await decide(trx, decision, candidate, REJECTED);
    const row = await suggestionRows(trx, decision)
      .selectAll()
      .where('id', '=', candidateId)
      .executeTakeFirstOrThrow();
    return view(row);
  });
}
