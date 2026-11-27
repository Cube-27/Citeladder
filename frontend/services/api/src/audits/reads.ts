import { sql } from 'kysely';
import {
  auditPageSchema,
  auditSchema,
  auditStatusSchema,
  executionSchema,
  auditMetricsSchema,
  type AuditListSort,
  type AuditPage,
  type AuditScope,
  type AuditStatus,
} from '@citeladder/contracts/audits';
import { auditEventSchema } from '@citeladder/contracts/audit-events';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record, strings } from '../db/json.ts';
import { timestamptz, utcText, utcTextOf, wireUtc, wireUtcOrNull } from '../db/timestamps.ts';
import type { ParsedDatetime } from '../http/datetimes.ts';
import { notFound } from '../errors.ts';
import { modelProvenanceFor } from '../analysis/provenance.ts';
import { engineSnapshots } from '../visibility/runs.ts';
import { firstOf } from '../lists.ts';

const auditTimes = () => [
  utcTextOf(sql.ref('created_at')).as('created_text'),
  utcTextOf(sql.ref('updated_at')).as('updated_text'),
  utcText(sql.ref('started_at')).as('started_text'),
  utcText(sql.ref('completed_at')).as('completed_text'),
];
function auditQuery(db: Database, workspaceId: string) {
  return db
    .selectFrom('audits')
    .selectAll()
    .select(auditTimes())
    .where('workspace_id', '=', workspaceId);
}
export async function authorizedAudit(db: Database, workspaceId: string, auditId: string) {
  const audit = await auditQuery(db, workspaceId).where('id', '=', auditId).executeTakeFirst();
  if (!audit) throw notFound('Audit');
  return audit;
}
function frozenMarket(audit: { market_id: string | null; configuration: unknown }) {
  const config = record(audit.configuration);
  return {
    id: audit.market_id,
    country_code: typeof config.country_code === 'string' ? config.country_code : '',
    language_code: typeof config.language_code === 'string' ? config.language_code : '',
  };
}
const LISTED_COLUMNS = [
  'id',
  'workspace_id',
  'project_id',
  'parent_audit_id',
  'status',
  'benchmark_mode',
  'audit_scope',
  'repetitions',
  'random_seed',
  'requested_count',
  'completed_count',
  'failed_count',
  'error_message',
  'launch_id',
  'market_id',
] as const;
type AuditRow = Pick<
  Awaited<ReturnType<typeof authorizedAudit>>,
  | (typeof LISTED_COLUMNS)[number]
  | 'created_text'
  | 'updated_text'
  | 'started_text'
  | 'completed_text'
> & { configuration: unknown };
async function auditResponses(db: Database, workspaceId: string, audits: AuditRow[]) {
  const routes = await engineSnapshots(
    db,
    workspaceId,
    audits.map((audit) => audit.id),
  );
  return audits.map((audit) =>
    auditSchema.parse({
      ...audit,
      cancelable: policy.audits.constants.audit_active_statuses.includes(audit.status),
      engine_snapshots: routes.get(audit.id) ?? [],
      market: frozenMarket(audit),
      not_applicable_engines: strings(record(audit.configuration).not_applicable_engines),
      model_provenance: modelProvenanceFor(routes.get(audit.id) ?? [], audit.configuration),
      created_at: wireUtc(audit.created_text),
      updated_at: wireUtc(audit.updated_text),
      started_at: wireUtcOrNull(audit.started_text),
      completed_at: wireUtcOrNull(audit.completed_text),
    }),
  );
}
export async function readAudit(db: Database, workspaceId: string, auditId: string) {
  return firstOf(
    await auditResponses(db, workspaceId, [await authorizedAudit(db, workspaceId, auditId)]),
    'the response built for the loaded audit',
  );
}
export async function readAudits(db: Database, workspaceId: string, auditIds: readonly string[]) {
  const rows = await auditQuery(db, workspaceId)
    .where('id', 'in', [...auditIds])
    .execute();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = auditIds.map((id) => byId.get(id)).filter((row) => row !== undefined);
  if (ordered.length !== auditIds.length) throw notFound('Audit');
  return auditResponses(db, workspaceId, ordered);
}
const listedSelection = () =>
  [
    ...LISTED_COLUMNS,
    sql<unknown>`jsonb_build_object(
        'country_code', configuration -> 'country_code',
        'language_code', configuration -> 'language_code',
        'not_applicable_engines', configuration -> 'not_applicable_engines',
        'measurement_policy', jsonb_build_object(
          'retrieval_enabled', configuration -> 'measurement_policy' -> 'retrieval_enabled'
        )
      )`.as('configuration'),
    ...auditTimes(),
  ] as const;
export async function listAudits(
  db: Database,
  page: { workspaceId: string; projectId?: string; limit?: number; afterId?: string },
) {
  const { workspaceId, projectId, limit = 50, afterId } = page;
  let query = db
    .selectFrom('audits')
    .select(listedSelection())
    .where('workspace_id', '=', workspaceId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit);
  if (projectId) query = query.where('project_id', '=', projectId);
  if (afterId)
    query = query.where(
      sql<boolean>`(audits.created_at, audits.id) < (SELECT anchor.created_at, anchor.id FROM audits AS anchor WHERE anchor.id = ${afterId} AND anchor.workspace_id = ${workspaceId} AND anchor.project_id = audits.project_id)`,
    );
  return auditResponses(db, workspaceId, await query.execute());
}
export type AuditMarketFilter = { kind: 'any' } | { kind: 'one'; id: string | null };
export type AuditPageRequest = Readonly<{
  workspaceId: string;
  projectId: string | null;
  scope: AuditScope | null;
  market: AuditMarketFilter;
  statuses: readonly AuditStatus[];
  completed: Readonly<{ from: ParsedDatetime | null; to: ParsedDatetime | null }>;
  sort: Readonly<{ key: AuditListSort; descending: boolean }>;
  page: number;
  pageSize: number;
}>;
const SORT_COLUMN = {
  created: sql.ref('created_at'),
  finished: sql`coalesce(completed_at, created_at)`,
  requested: sql.ref('requested_count'),
  completed: sql.ref('completed_count'),
  failed: sql.ref('failed_count'),
} satisfies Record<AuditListSort, unknown>;
function scopedAudits(db: Database, request: AuditPageRequest) {
  let query = db.selectFrom('audits').where('workspace_id', '=', request.workspaceId);
  if (request.projectId) query = query.where('project_id', '=', request.projectId);
  if (request.scope) query = query.where('audit_scope', '=', request.scope);
  return query;
}
function filteredAudits(db: Database, request: AuditPageRequest) {
  const { market, statuses, completed } = request;
  let query = scopedAudits(db, request);
  if (market.kind === 'one') query = query.where('market_id', 'is not distinct from', market.id);
  if (statuses.length) query = query.where('status', 'in', [...statuses]);
  if (completed.from) query = query.where('completed_at', '>=', timestamptz(completed.from));
  if (completed.to) query = query.where('completed_at', '<=', timestamptz(completed.to));
  return query;
}
export async function pageAudits(db: Database, request: AuditPageRequest): Promise<AuditPage> {
  const direction = request.sort.descending ? 'desc' : 'asc';
  const [counts, total, rows] = await Promise.all([
    scopedAudits(db, request)
      .select(['status', (eb) => eb.fn.countAll<string>().as('count')])
      .groupBy('status')
      .execute(),
    filteredAudits(db, request)
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow(),
    filteredAudits(db, request)
      .select(listedSelection())
      .orderBy(SORT_COLUMN[request.sort.key], direction)
      .orderBy('id', direction)
      .limit(request.pageSize)
      .offset((request.page - 1) * request.pageSize)
      .execute(),
  ]);
  const statusCounts = Object.fromEntries(auditStatusSchema.options.map((status) => [status, 0]));
  for (const row of counts) statusCounts[row.status] = Number(row.count);
  return {
    items: await auditResponses(db, request.workspaceId, rows),
    total: Number(total.count),
    page: request.page,
    page_size: request.pageSize,
    status_counts: auditPageSchema.shape.status_counts.parse(statusCounts),
  };
}
export async function listExecutions(db: Database, workspaceId: string, auditId: string) {
  await authorizedAudit(db, workspaceId, auditId);
  const tasks = await db
    .selectFrom('audit_tasks')
    .select([
      'id',
      'prompt_index',
      'repetition',
      'logical_engine',
      'transport_provider',
      'status',
      'prompt_text',
      'error_code',
      'latency_ms',
    ])
    .where('workspace_id', '=', workspaceId)
    .where('audit_id', '=', auditId)
    .orderBy('randomized_position')
    .execute();
  return tasks.map((task) => executionSchema.parse(task));
}
export async function readAuditMetrics(db: Database, workspaceId: string, auditId: string) {
  await authorizedAudit(db, workspaceId, auditId);
  const metric = await db
    .selectFrom('metric_snapshots')
    .selectAll()
    .select(utcTextOf(sql.ref('created_at')).as('created_text'))
    .where('workspace_id', '=', workspaceId)
    .where('audit_id', '=', auditId)
    .executeTakeFirst();
  if (!metric) throw notFound('Audit metrics');
  return auditMetricsSchema.parse({ ...metric, created_at: wireUtc(metric.created_text) });
}
export async function auditEvents(
  db: Database,
  workspaceId: string,
  auditId: string,
  after: string | undefined,
  limit: number,
) {
  await authorizedAudit(db, workspaceId, auditId);
  if (
    after &&
    !(await db
      .selectFrom('audit_events')
      .select('id')
      .where('id', '=', after)
      .where('audit_id', '=', auditId)
      .executeTakeFirst())
  )
    throw notFound('Audit');
  let query = db
    .selectFrom('audit_events')
    .selectAll()
    .select(utcTextOf(sql.ref('created_at')).as('created_text'))
    .where('audit_id', '=', auditId)
    .orderBy('created_at')
    .orderBy('id')
    .limit(limit);
  if (after) {
    const anchor = db
      .selectFrom('audit_events')
      .select('created_at')
      .where('id', '=', after)
      .where('audit_id', '=', auditId);
    query = query.where((eb) =>
      eb.or([
        eb('created_at', '>', anchor),
        eb.and([eb('created_at', '=', anchor), eb('id', '>', after)]),
      ]),
    );
  }
  return (await query.execute()).map((event) =>
    auditEventSchema.parse({
      id: event.id,
      audit_id: auditId,
      occurred_at: wireUtc(event.created_text),
      event_type: event.event_type,
      payload: event.event_type === 'audit.running' ? null : record(event.payload),
    }),
  );
}
