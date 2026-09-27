/** Traffic refresh and display-only range projection. No provider I/O. */
import { randomUUID } from 'node:crypto';

import { blake2b } from '@noble/hashes/blake2.js';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { isoDateText } from '../db/timestamps.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { enqueueTask } from '../referrals/enqueue.ts';
import { addDays } from '../referrals/projection.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { payloadWindow, requireProject, taskProject, type Executor } from '../workers/executor.ts';
import type { MetricRow } from './accumulators.ts';
import { hash } from './normalization.ts';
import { record, windowDays } from './performance.ts';
import { TrafficProjectionBuilder, type Projection } from './projection.ts';

const p = policy.traffic;
type Target = {
  start: string;
  end: string;
  grain: string;
  preset: number | null;
  verifies: boolean;
  builder: TrafficProjectionBuilder;
};

/** Exact Python demand enqueue revision: BLAKE2b-128 XOR, then sorted-key SHA256. */
class DemandRevision {
  private count = 0;
  private digest = 0n;
  private readonly start: string;
  private readonly end: string;
  constructor(start: string, end: string) {
    this.start = start;
    this.end = end;
  }
  add(row: Pick<MetricRow, 'id' | 'date'>) {
    if (row.date < this.start || row.date > this.end) return;
    this.count += 1;
    this.digest ^= BigInt(
      `0x${Buffer.from(blake2b(new TextEncoder().encode(row.id), { dkLen: 16 })).toString('hex')}`,
    );
  }
  revision() {
    return hash(
      JSON.stringify({
        metric_row_count: this.count,
        metric_row_digest: this.digest.toString(16).padStart(32, '0'),
        window: [this.start, this.end],
      }),
    ).slice(0, 24);
  }
}

async function persist(
  db: Database,
  task: QueueTask,
  target: Target,
  coverage: Record<string, unknown>,
  preserve: boolean,
): Promise<string | null> {
  const projection = target.builder.build();
  const content = {
    metrics: JSON.stringify(projection.metrics),
    dimension_counts: JSON.stringify(projection.dimension_counts),
    coverage: JSON.stringify(coverage),
    preset_window_days: target.preset,
    source_metric_row_ids: JSON.stringify(projection.source_metric_row_ids),
    source_artifact_ids: JSON.stringify(projection.source_artifact_ids),
    formula_version: p.TRAFFIC_FORMULA_VERSION,
    normalization_version: p.TRAFFIC_NORMALIZATION_VERSION,
    created_at: new Date(),
  };
  const row = await db
    .insertInto('traffic_snapshots')
    .values({
      id: randomUUID(),
      workspace_id: task.workspace_id,
      project_id: requireProject(task),
      window_start: target.start,
      window_end: target.end,
      granularity: target.grain,
      ...content,
    })
    .onConflict((conflict) => {
      const key = conflict.columns(['project_id', 'window_start', 'window_end', 'granularity']);
      return preserve
        ? key.doNothing()
        : key.doUpdateSet(content).where('traffic_snapshots.workspace_id', '=', task.workspace_id);
    })
    .returning('id')
    .executeTakeFirst();
  if (!row) return null;
  await replaceStats(db, task, row.id, projection);
  return row.id;
}

async function replaceStats(
  db: Database,
  task: QueueTask,
  snapshotId: string,
  projection: Projection,
) {
  const projectId = requireProject(task);
  const base = () => ({
    id: randomUUID(),
    workspace_id: task.workspace_id,
    project_id: projectId,
    snapshot_id: snapshotId,
    created_at: new Date(),
  });
  const data = (
    row:
      | Projection['pages'][number]
      | Projection['queries'][number]
      | Projection['dimensions'][number],
  ) => ({
    metrics: JSON.stringify(row.metrics),
    source_metric_row_ids: JSON.stringify(row.source_metric_row_ids),
    source_artifact_ids: JSON.stringify(row.source_artifact_ids),
  });
  for (const table of [
    'traffic_page_stats',
    'traffic_query_stats',
    'performance_dimension_stats',
  ] as const)
    await db
      .deleteFrom(table)
      .where('workspace_id', '=', task.workspace_id)
      .where('project_id', '=', projectId)
      .where('snapshot_id', '=', snapshotId)
      .execute();
  // Bound lookup and insert parameter counts as well as evidence reads.
  const size = p.TRAFFIC_METRIC_ROW_BATCH_SIZE;
  const ids = new Map<string, string>();
  for (let i = 0; i < projection.pages.length; i += size)
    for (const r of await new WorkspaceScope(task.workspace_id)
      .selectFrom(db, 'site_urls')
      .select(['id', 'url_hash'])
      .where('project_id', '=', projectId)
      .where(
        'url_hash',
        'in',
        projection.pages.slice(i, i + size).map((r) => r.url_hash),
      )
      .execute())
      ids.set(r.url_hash, r.id);
  for (let i = 0; i < projection.pages.length; i += size)
    await db
      .insertInto('traffic_page_stats')
      .values(
        projection.pages.slice(i, i + size).map((r) => ({
          ...base(),
          ...data(r),
          canonical_url: r.canonical_url,
          site_url_id: ids.get(r.url_hash) ?? null,
        })),
      )
      .execute();
  for (let i = 0; i < projection.queries.length; i += size)
    await db
      .insertInto('traffic_query_stats')
      .values(
        projection.queries
          .slice(i, i + size)
          .map((r) => ({ ...base(), ...data(r), normalized_query: r.normalized_query })),
      )
      .execute();
  for (let i = 0; i < projection.dimensions.length; i += size)
    await db
      .insertInto('performance_dimension_stats')
      .values(
        projection.dimensions.slice(i, i + size).map((r) => ({
          ...base(),
          ...data(r),
          dimension: r.dimension,
          dimension_key: r.dimension_key,
          display_value: r.display_value,
        })),
      )
      .execute();
}

async function scan(
  db: Database,
  task: QueueTask,
  targets: Target[],
  demand: DemandRevision,
  checkCancelled: (boundary: string) => Promise<void>,
) {
  const columns = [
    'property_ref',
    'provider',
    'dataset',
    'date',
    'dimension_key',
    'resync_seq',
    'id',
  ] as const;
  const cursor = sql`(${sql.join(columns.map((c) => sql.ref(c)))})`;
  const start = targets.map((t) => t.start).sort()[0]!;
  const end = targets
    .map((t) => t.end)
    .sort()
    .at(-1)!;
  let after: MetricRow | null = null;
  for (;;) {
    await checkCancelled('metric-row batch');
    let query = new WorkspaceScope(task.workspace_id)
      .selectFrom(db, 'integration_metric_rows')
      .selectAll()
      .select(isoDateText(sql.ref('date')).as('day'))
      .where('project_id', '=', requireProject(task))
      .where('dataset', 'in', p.TRAFFIC_PROJECTED_DATASETS)
      .where('date', '>=', sql<Date>`${start}::date`)
      .where('date', '<=', sql<Date>`${end}::date`)
      .limit(p.TRAFFIC_METRIC_ROW_BATCH_SIZE);
    for (const column of columns) query = query.orderBy(column);
    if (after)
      query = query.where(
        sql<boolean>`${cursor} > (${after.property_ref}, ${after.provider}, ${after.dataset}, ${after.date}::date, ${after.dimension_key}, ${after.resync_seq}, ${after.id}::uuid)`,
      );
    const rows = await query.execute();
    const inputs = rows.map((r) => ({ ...r, date: r.day, metrics: record(r.metrics) }));
    for (const target of targets) target.builder.addBatch(inputs, true);
    for (const row of inputs) demand.add(row);
    if (rows.length < p.TRAFFIC_METRIC_ROW_BATCH_SIZE) break;
    after = inputs.at(-1)!;
  }
}

function executor(displayOnly: boolean): Executor {
  return async (task, { db, checkCancelled, maxAttempts }) => {
    const projectId = await taskProject(db, task);
    const { windowStart, windowEnd } = payloadWindow(task);
    const scope = new WorkspaceScope(task.workspace_id);
    const origin = await scope
      .selectFrom(db, 'site_health_profiles')
      .select('root_url')
      .where('project_id', '=', projectId)
      .executeTakeFirst();
    const anchor = await scope
      .selectFrom(db, 'integration_metric_rows')
      .select(isoDateText(sql`max(date)`).as('day'))
      .where('project_id', '=', projectId)
      .where('dataset', '=', p.DATASET_GSC_DAY_DAILY)
      .executeTakeFirst();
    const existing = displayOnly
      ? await scope
          .selectFrom(db, 'traffic_snapshots')
          .select('granularity')
          .where('project_id', '=', projectId)
          .where('window_start', '=', sql<Date>`${windowStart}::date`)
          .where('window_end', '=', sql<Date>`${windowEnd}::date`)
          .execute()
      : [];
    const targets: Target[] = [];
    const add = (
      start: string,
      end: string,
      grain: string,
      preset: number | null,
      verifies: boolean,
    ) =>
      targets.push({
        start,
        end,
        grain,
        preset,
        verifies,
        builder: new TrafficProjectionBuilder({
          windowStart: start,
          windowEnd: end,
          granularity: grain,
          projectOrigin: origin?.root_url,
        }),
      });
    for (const grain of p.TRAFFIC_SNAPSHOT_GRANULARITIES)
      if (!existing.some((r) => r.granularity === grain))
        add(
          windowStart,
          windowEnd,
          grain,
          null,
          !displayOnly && grain === p.TRAFFIC_DEFAULT_GRANULARITY,
        );
    if (!displayOnly && anchor?.day)
      for (const days of p.PERFORMANCE_SNAPSHOT_WINDOW_DAYS)
        for (const grain of p.TRAFFIC_SNAPSHOT_GRANULARITIES)
          add(addDays(anchor.day, -(days - 1)), anchor.day, grain, days, false);
    if (!targets.length) return;
    const demand = new DemandRevision(windowStart, windowEnd);
    await scan(db, task, targets, demand, checkCancelled);
    const extent = await scope
      .selectFrom(db, 'integration_metric_rows')
      .select([isoDateText(sql`min(date)`).as('start'), isoDateText(sql`max(date)`).as('end')])
      .where('project_id', '=', projectId)
      .where('dataset', 'in', p.TRAFFIC_CONSUMED_DATASETS)
      .executeTakeFirstOrThrow();
    const coverage = {
      earliest_date: extent.start,
      latest_date: extent.end,
      covered_days: extent.start && extent.end ? windowDays(extent.start, extent.end) : 0,
    };
    await checkCancelled('snapshot write');
    await db.transaction().execute(async (trx) => {
      for (const target of targets) {
        const snapshotId = await persist(trx, task, target, coverage, displayOnly);
        if (snapshotId && target.verifies)
          await enqueueTask(trx, {
            workspaceId: task.workspace_id,
            projectId,
            kind: 'opportunity_verification',
            payload: { trigger_kind: 'traffic_snapshot', trigger_id: snapshotId },
            keyParts: [],
            idempotencyKey: `implementation-verification:traffic_snapshot:${snapshotId}:${p.implementation_verifier_version}:${task.id}`,
            maxAttempts,
          });
      }
      if (!displayOnly)
        await enqueueTask(trx, {
          workspaceId: task.workspace_id,
          projectId,
          kind: 'demand_snapshot_refresh',
          payload: {
            window_start: windowStart,
            window_end: windowEnd,
            source_revision: demand.revision(),
            manual: false,
          },
          keyParts: [projectId, windowStart, windowEnd, 0, demand.revision()],
          maxAttempts,
        });
    });
  };
}

export const refreshTrafficSnapshot = executor(false);
export const projectPerformanceRange = executor(true);
