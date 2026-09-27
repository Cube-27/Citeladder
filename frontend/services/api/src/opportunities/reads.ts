/**
 * Workspace-scoped persisted Opportunity reads (`queries.py`, `export.py`,
 * `history.py`, `summary.py`). Reads render what refreshes persisted; none
 * of them recomputes, refreshes a source or repairs state.
 */
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { isoUtc, utcText, utcTextOf } from '../db/timestamps.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { ApiError, notFound } from '../errors.ts';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  InvalidCursorError,
} from '../http/keyset-cursor.ts';
import { parseUuid } from '../http/uuid.ts';
import { opportunityStatusClause, validateStatus } from './action-status.ts';
import {
  OPPORTUNITY_COLUMNS,
  orderedItems,
  projectDetail,
  projectExportRow,
  type OpportunityRow,
} from './projection.ts';
import type { Scope } from './sources.ts';

const o = policy.opportunity.opportunities;
const e = policy.opportunity.earned_actions;
const LIST_SCOPE = 'opportunities';
const EARNED_RULE_IDS = [...o.EARNED_RULE_IDS].sort();

export type OpportunityFilters = {
  type: string | null;
  severity: string | null;
  status: string | null;
  rule_id: string | null;
  min_priority: number | null;
  action_path?: string | null;
};

export async function requireProject(db: Database, scope: Scope): Promise<void> {
  const project = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'projects')
    .select('id')
    .where('id', '=', scope.projectId)
    .executeTakeFirst();
  if (!project) throw notFound('Project');
}

function invalid(message: string): never {
  throw new ApiError(422, message);
}

function validateFilters(filters: OpportunityFilters): void {
  if (filters.type !== null && !o.OPPORTUNITY_TYPES.includes(filters.type))
    invalid(`unknown opportunity type: ${filters.type}`);
  if (filters.severity !== null && !o.OPPORTUNITY_SEVERITIES.includes(filters.severity))
    invalid(`unknown opportunity severity: ${filters.severity}`);
  if (filters.status !== null) validateStatus(filters.status);
  if (filters.rule_id !== null && !Object.hasOwn(o.OPPORTUNITY_RULES_BY_ID, filters.rule_id))
    invalid(`unknown opportunity rule_id: ${filters.rule_id}`);
  const path = filters.action_path;
  if (path !== undefined && path !== null && !e.ACTION_PATHS.includes(path))
    invalid(`unknown action path: ${path}`);
}

function filtered(db: Database, scope: Scope, filters: OpportunityFilters) {
  let query = new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'opportunities')
    .select(OPPORTUNITY_COLUMNS)
    .where('opportunities.project_id', '=', scope.projectId)
    .where('opportunities.superseded_at', 'is', null);
  if (filters.type) query = query.where('opportunities.opportunity_type', '=', filters.type);
  if (filters.severity) query = query.where('opportunities.severity', '=', filters.severity);
  query = query.where(opportunityStatusClause(filters.status));
  if (filters.rule_id) query = query.where('opportunities.rule_id', '=', filters.rule_id);
  if (filters.min_priority !== null)
    query = query.where('opportunities.priority_score', '>=', filters.min_priority);
  // Every rule the catalog declares earned, not one id.
  if (filters.action_path === e.ACTION_PATH_EARNED)
    query = query.where('opportunities.rule_id', 'in', EARNED_RULE_IDS);
  else if (filters.action_path === e.ACTION_PATH_OWNED)
    query = query.where('opportunities.rule_id', 'not in', EARNED_RULE_IDS);
  return query;
}

function cursorFilters(scope: Scope, filters: OpportunityFilters) {
  return {
    project_id: scope.projectId,
    type: filters.type || null,
    severity: filters.severity || null,
    status: filters.status || null,
    rule_id: filters.rule_id || null,
    min_priority: filters.min_priority,
    action_path: filters.action_path ?? null,
  };
}

function badCursor(error: unknown): never {
  if (!(error instanceof InvalidCursorError)) throw error;
  throw new ApiError(400, error.message, { code: 'invalid_cursor' });
}

/** A cursor's score, or an invalid cursor. */
function cursorScore(text: string): number {
  const score = Number(text);
  if (text === '' || !Number.isFinite(score)) throw new InvalidCursorError('invalid cursor');
  return score;
}

/** Live-row catalog page, ordered by priority then UUID. */
export async function listOpportunities(
  db: Database,
  scope: Scope,
  filters: OpportunityFilters,
  page: { limit: number; cursor: string | null },
) {
  await requireProject(db, scope);
  validateFilters(filters);
  const limit = Math.max(1, Math.min(page.limit, o.LIST_MAX_LIMIT));
  const fingerprint = cursorFilters(scope, filters);
  let query = filtered(db, scope, filters);
  if (page.cursor) {
    let score: number;
    let id: string;
    try {
      const [scoreText = '', idText = ''] = decodeKeysetCursor(
        page.cursor,
        LIST_SCOPE,
        fingerprint,
      );
      score = cursorScore(scoreText);
      const parsed = parseUuid(idText);
      if (parsed === null) throw new InvalidCursorError('invalid cursor');
      id = parsed;
    } catch (error) {
      badCursor(error);
    }
    query = query.where((eb) =>
      eb.or([
        eb('opportunities.priority_score', '<', score),
        eb.and([eb('opportunities.priority_score', '=', score), eb('opportunities.id', '<', id)]),
      ]),
    );
  }
  let rows: OpportunityRow[] = await query
    .orderBy('opportunities.priority_score', 'desc')
    .orderBy('opportunities.id', 'desc')
    .limit(limit + 1)
    .execute();
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows = rows.slice(0, limit);
    const last = rows.at(-1)!;
    nextCursor = encodeKeysetCursor(LIST_SCOPE, fingerprint, [
      String(last.priority_score),
      last.id,
    ]);
  }
  const order = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'opportunity_orders')
    .select('ordered_keys')
    .where('project_id', '=', scope.projectId)
    .executeTakeFirst();
  return { items: orderedItems(rows, order?.ordered_keys ?? null), next_cursor: nextCursor };
}

/** One row, live or superseded, with its full evidence and provenance. */
export async function getOpportunity(db: Database, workspaceId: string, opportunityId: string) {
  const row = await new WorkspaceScope(workspaceId)
    .selectFrom(db, 'opportunities')
    .select(OPPORTUNITY_COLUMNS)
    .where('opportunities.id', '=', opportunityId)
    .executeTakeFirst();
  if (!row) throw notFound('Opportunity');
  return projectDetail(row);
}

/** The bounded, filtered persisted catalog the exports render. */
export async function loadExportRows(db: Database, scope: Scope, filters: OpportunityFilters) {
  await requireProject(db, scope);
  validateFilters({ ...filters, action_path: undefined });
  const rows = await filtered(db, scope, { ...filters, action_path: undefined })
    .orderBy('opportunities.priority_score', 'desc')
    .orderBy('opportunities.id', 'desc')
    .limit(o.MAX_EXPORT_ITEMS)
    .execute();
  return rows.map(projectExportRow);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
type Occurrence = {
  id: string;
  title: string;
  created_text: string;
  superseded_text: string | null;
};

function activeAt(occurrences: Occurrence[], at: string | null): Occurrence | undefined {
  const newestFirst = [...occurrences].reverse();
  if (at === null) return newestFirst.find((row) => row.superseded_text === null);
  return newestFirst.find(
    (row) => row.created_text <= at && (row.superseded_text === null || row.superseded_text > at),
  );
}

function historyGroup(
  key: [string, string],
  occurrences: Occurrence[],
  latest: string | null,
  previous: string | null,
) {
  const current = activeAt(occurrences, latest);
  const before = activeAt(occurrences, previous);
  const transition = current && before ? 'continuing' : current ? 'new' : 'resolved';
  const group = {
    rule_id: key[0],
    target_key: key[1],
    title: occurrences.at(-1)!.title || '',
    // Whether the rule still fires on this target; workflow status belongs to the Action.
    current_state: current ? 'live' : 'resolved',
    transition,
    occurrence_count: occurrences.length,
    first_seen: isoUtc(occurrences[0]!.created_text),
    last_seen: isoUtc(occurrences.at(-1)!.created_text),
    timeline: occurrences.map((row) => ({ id: row.id, seen_at: isoUtc(row.created_text) })),
  };
  return { group, transition, changed: Boolean(current || before) };
}

/** Grouped rows compared with the two latest persisted snapshots. */
export async function groupedHistory(db: Database, scope: Scope) {
  await requireProject(db, scope);
  const workspace = new WorkspaceScope(scope.workspaceId);
  const snapshots = await workspace
    .selectFrom(db, 'opportunity_snapshots')
    .select(utcTextOf(sql.ref('created_at')).as('at'))
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(2)
    .execute();
  const rows = await workspace
    .selectFrom(db, 'opportunities')
    .select(['id', 'rule_id', 'target_key', 'title'])
    .select([
      utcTextOf(sql.ref('created_at')).as('created_text'),
      utcText(sql.ref('superseded_at')).as('superseded_text'),
    ])
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  const groups = new Map<string, { key: [string, string]; rows: Occurrence[] }>();
  for (const row of rows) {
    const id = JSON.stringify([row.rule_id, row.target_key]);
    const entry = groups.get(id) ?? { key: [row.rule_id, row.target_key], rows: [] };
    entry.rows.push(row);
    groups.set(id, entry);
  }
  const counts: Record<string, number> = { new: 0, continuing: 0, resolved: 0 };
  const items = [...groups.values()].map(({ key, rows: occurrences }) => {
    const found = historyGroup(
      key,
      occurrences,
      snapshots[0]?.at ?? null,
      snapshots[1]?.at ?? null,
    );
    if (found.changed) counts[found.transition]! += 1;
    return found.group;
  });
  items.sort((a, b) => compareDesc(a.last_seen, b.last_seen) || compareDesc(a.rule_id, b.rule_id));
  return { items, since_previous: counts };
}

function compareDesc(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? 1 : -1;
}
