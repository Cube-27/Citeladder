import { randomUUID } from 'node:crypto';

import type { Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import { resolveAccountEntitlement } from '../entitlements/resolve.ts';
import { integrationPolicy, integrationSettings } from './config.ts';

const settings = integrationSettings();

function isoDay(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isoTimestamp(value: Date | string): string;
function isoTimestamp(value: Date | string | null): string | null;
function isoTimestamp(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function day(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function dateAfter(value: string, days: number): string {
  return new Date(day(value) + days * 86_400_000).toISOString().slice(0, 10);
}

function windowFor(start: string | undefined, end: string | undefined): [string, string] {
  if ((start === undefined) !== (end === undefined)) {
    throw new ApiError(422, 'The requested sync window is invalid', {
      code: 'sync_window_invalid',
    });
  }
  const yesterday = isoDay(new Date(Date.now() - 86_400_000));
  if (start === undefined || end === undefined) {
    return [dateAfter(yesterday, -(settings.sync_default_window_days - 1)), yesterday];
  }
  if (!Number.isFinite(day(start)) || !Number.isFinite(day(end)) || start > end) {
    throw new ApiError(422, 'The requested sync window is invalid', {
      code: 'sync_window_invalid',
    });
  }
  const boundedStart =
    day(end) - day(start) >= settings.sync_backfill_max_days * 86_400_000
      ? dateAfter(end, -(settings.sync_backfill_max_days - 1))
      : start;
  return [boundedStart, end];
}

export async function enqueueSyncRun(
  db: Database,
  input: {
    workspaceId: string;
    connectionId: string;
    mappingId?: string;
    projectId?: string;
    windowStart?: string;
    windowEnd?: string;
    syncKind?: 'on_demand' | 'scheduled' | 'backfill';
  },
) {
  return db.transaction().execute(async (trx) => {
    const connection = await trx
      .selectFrom('integration_connections')
      .select('id')
      .where('id', '=', input.connectionId)
      .where('workspace_id', '=', input.workspaceId)
      .forUpdate()
      .executeTakeFirst();
    if (connection === undefined) throw notFound('Integration connection');

    let mappings = trx
      .selectFrom('integration_property_mappings')
      .selectAll()
      .where('connection_id', '=', input.connectionId)
      .where('workspace_id', '=', input.workspaceId)
      .where('status', '=', 'active');
    if (input.projectId !== undefined)
      mappings = mappings.where('project_id', '=', input.projectId);
    if (input.mappingId !== undefined) mappings = mappings.where('id', '=', input.mappingId);
    const targets = await mappings.execute();
    if (targets.length === 0) {
      throw new ApiError(409, 'Select a property for this project before syncing', {
        code: 'sync_target_unresolved',
      });
    }
    if (targets.length > 1) {
      throw new ApiError(409, 'Name project_id: this connection serves several projects', {
        code: 'sync_target_unresolved',
      });
    }
    const target = targets[0];
    if (target === undefined) throw new Error('resolved sync target disappeared');
    let [windowStart, windowEnd] = windowFor(input.windowStart, input.windowEnd);
    if (
      input.windowStart === undefined &&
      input.windowEnd === undefined &&
      (input.syncKind ?? 'on_demand') === 'on_demand'
    ) {
      const yesterday = isoDay(new Date(Date.now() - 86_400_000));
      const windows = await trx
        .selectFrom('integration_sync_runs')
        .select(['window_start', 'window_end'])
        .where('mapping_id', '=', target.id)
        .where('workspace_id', '=', input.workspaceId)
        .where('status', '=', 'succeeded')
        .orderBy('window_start', 'asc')
        .orderBy('window_end', 'asc')
        .execute();
      let covered: string | null = null;
      for (const item of windows) {
        const start = isoDay(item.window_start);
        const end = isoDay(item.window_end);
        if (covered === null) {
          covered = end;
          continue;
        }
        if (start > dateAfter(covered, 1)) break;
        if (end > covered) covered = end;
      }
      if (covered !== null) {
        const earliest = dateAfter(yesterday, -(settings.sync_backfill_max_days - 1));
        windowStart = dateAfter(covered, 1 - settings.sync_late_data_revision_days);
        if (windowStart < earliest) windowStart = earliest;
        if (windowStart > yesterday) windowStart = yesterday;
        windowEnd = yesterday;
      }
    }
    const prior = await trx
      .selectFrom('integration_sync_runs')
      .select('resync_seq')
      .where('workspace_id', '=', input.workspaceId)
      .where((eb) =>
        eb.or([
          eb('connection_id', '=', input.connectionId),
          eb.and([
            eb('project_id', '=', target.project_id),
            eb('property_ref', '=', target.property_ref),
          ]),
        ]),
      )
      .orderBy('resync_seq', 'desc')
      .executeTakeFirst();
    const sequence = (prior?.resync_seq ?? -1) + 1;
    const id = randomUUID();
    const now = new Date();
    const kind = input.syncKind ?? 'on_demand';
    const key = `sync:${input.connectionId}:${target.id}:${kind}:${windowStart}:${windowEnd}:${sequence}`;
    try {
      await trx
        .insertInto('integration_sync_runs')
        .values({
          id,
          workspace_id: input.workspaceId,
          connection_id: input.connectionId,
          mapping_id: target.id,
          property_ref: target.property_ref,
          project_id: target.project_id,
          sync_kind: kind,
          window_start: new Date(`${windowStart}T00:00:00Z`),
          window_end: new Date(`${windowEnd}T00:00:00Z`),
          resync_seq: sequence,
          idempotency_key: key,
          status: 'queued',
          priority: 0,
          randomized_position: 0,
          available_at: now,
          attempt_count: 0,
          max_attempts: settings.sync_max_attempts,
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: null,
          error_code: '',
          error_detail: '',
          created_at: now,
          updated_at: now,
          completed_at: null,
        })
        .execute();
    } catch (error) {
      if (String(error).includes('ix_integration_sync_runs_active_window')) {
        throw new ApiError(409, 'A sync window is already active for this connection', {
          code: 'sync_active_window_conflict',
          details: { enqueued_connection_ids: [] },
        });
      }
      throw error;
    }
    return { sync_run_id: id, connection_id: input.connectionId, status: 'queued' };
  });
}

/** Resolve the history allowance and enqueue missing or failed immutable windows. */
export async function enqueueHistoryBackfill(
  db: Database,
  input: {
    workspaceId: string;
    connectionId: string;
    mappingId: string;
    projectId: string;
    propertyRef: string;
  },
): Promise<void> {
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', input.workspaceId)
    .executeTakeFirst();
  let days = integrationPolicy.free_history_window_days;
  if (account) {
    const resolved = await resolveAccountEntitlement(
      db,
      { accountId: account.id, workspaceId: input.workspaceId },
      new Date(),
    );
    if (resolved.status === 'resolved') {
      const key = integrationPolicy.history_window_capability_key;
      const level = resolved.values.get(key);
      const name = level === undefined ? undefined : integrationPolicy.history_window_values[level];
      days = name
        ? integrationPolicy.history_window_days[
            name as keyof typeof integrationPolicy.history_window_days
          ]
        : days;
    }
  }
  days = Math.min(days, settings.sync_backfill_max_days);
  const prior = await db
    .selectFrom('integration_sync_runs')
    .select(['window_start', 'window_end', 'status'])
    .where('workspace_id', '=', input.workspaceId)
    .where('project_id', '=', input.projectId)
    .where('property_ref', '=', input.propertyRef)
    .where('sync_kind', '=', 'backfill')
    .execute();
  const alive = new Set(
    prior
      .filter((row) => !['failed', 'cancelled'].includes(row.status))
      .map((row) => `${isoDay(row.window_start)}:${isoDay(row.window_end)}`),
  );
  const candidates: Array<[string, string]> = [];
  if (prior.length) {
    for (const row of prior) {
      const window = [isoDay(row.window_start), isoDay(row.window_end)] as [string, string];
      if (['failed', 'cancelled'].includes(row.status) && !alive.has(`${window[0]}:${window[1]}`))
        candidates.push(window);
    }
  } else {
    const end = isoDay(new Date(Date.now() - 86_400_000));
    let start = dateAfter(end, -(days - 1));
    while (start <= end) {
      const chunkEnd = dateAfter(start, settings.sync_backfill_max_days - 1);
      const boundedEnd = chunkEnd < end ? chunkEnd : end;
      candidates.push([start, boundedEnd]);
      start = dateAfter(boundedEnd, 1);
    }
  }
  for (const [windowStart, windowEnd] of candidates) {
    try {
      await enqueueSyncRun(db, {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        mappingId: input.mappingId,
        projectId: input.projectId,
        windowStart,
        windowEnd,
        syncKind: 'backfill',
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'sync_active_window_conflict') continue;
      throw error;
    }
  }
}

export async function listSyncRuns(db: Database, workspaceId: string, connectionId: string) {
  const connection = await db
    .selectFrom('integration_connections')
    .select('id')
    .where('id', '=', connectionId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (connection === undefined) throw notFound('Integration connection');
  const rows = await db
    .selectFrom('integration_sync_runs as runs')
    .leftJoin('integration_import_artifacts as artifacts', 'artifacts.sync_run_id', 'runs.id')
    .select([
      'runs.id',
      'runs.connection_id',
      'runs.sync_kind',
      'runs.status',
      'runs.window_start',
      'runs.window_end',
      'runs.resync_seq',
      'runs.error_code',
      'runs.error_detail',
      'runs.created_at',
      'runs.updated_at',
      'runs.completed_at',
    ])
    .select((eb) =>
      eb.fn.coalesce(eb.fn.sum<number>('artifacts.row_count'), eb.val(0)).as('row_count'),
    )
    .where('runs.workspace_id', '=', workspaceId)
    .where('runs.connection_id', '=', connectionId)
    .groupBy(['runs.id'])
    .orderBy('runs.created_at', 'desc')
    .execute();
  return rows.map((row) => ({
    ...row,
    window_start: isoDay(row.window_start),
    window_end: isoDay(row.window_end),
    created_at: isoTimestamp(row.created_at),
    updated_at: isoTimestamp(row.updated_at),
    completed_at: isoTimestamp(row.completed_at),
    row_count: Number(row.row_count),
  }));
}

export async function listMappings(db: Database, workspaceId: string, connectionId: string) {
  const connection = await db
    .selectFrom('integration_connections')
    .select('id')
    .where('id', '=', connectionId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (connection === undefined) throw notFound('Integration connection');
  const rows = await db
    .selectFrom('integration_property_mappings')
    .select([
      'id',
      'workspace_id',
      'connection_id',
      'provider',
      'property_ref',
      'project_id',
      'status',
      'created_at',
      'updated_at',
    ])
    .where('workspace_id', '=', workspaceId)
    .where('connection_id', '=', connectionId)
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .execute();
  return rows.map((row) => ({
    ...row,
    created_at: isoTimestamp(row.created_at),
    updated_at: isoTimestamp(row.updated_at),
  }));
}

export async function getBackfillProgress(db: Database, workspaceId: string, connectionId: string) {
  const connection = await db
    .selectFrom('integration_connections')
    .select('id')
    .where('id', '=', connectionId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (connection === undefined) throw notFound('Integration connection');
  const runs = await db
    .selectFrom('integration_sync_runs')
    .select(['mapping_id', 'status', 'window_start', 'window_end'])
    .where('workspace_id', '=', workspaceId)
    .where('connection_id', '=', connectionId)
    .where('sync_kind', '=', 'backfill')
    .execute();
  const attempts = new Map<string, Set<string>>();
  for (const run of runs) {
    const key = `${run.mapping_id}:${isoDay(run.window_start)}:${isoDay(run.window_end)}`;
    const statusesForWindow = attempts.get(key) ?? new Set<string>();
    statusesForWindow.add(run.status);
    attempts.set(key, statusesForWindow);
  }
  const succeededKeys = new Set(
    [...attempts].flatMap(([key, statusesForWindow]) =>
      statusesForWindow.has('succeeded') ? [key] : [],
    ),
  );
  const failed = [...attempts.values()].filter(
    (statusesForWindow) =>
      !statusesForWindow.has('succeeded') &&
      [...statusesForWindow].every((status) => ['failed', 'cancelled'].includes(status)),
  ).length;
  const completed = succeededKeys.size;
  const pending = attempts.size - completed - failed;
  const windows = runs
    .filter((run) =>
      succeededKeys.has(`${run.mapping_id}:${isoDay(run.window_start)}:${isoDay(run.window_end)}`),
    )
    .map((run) => [isoDay(run.window_start), isoDay(run.window_end)] as const)
    .sort();
  let from: string | null = null;
  let through: string | null = null;
  for (const [start, end] of windows) {
    if (from === null) {
      from = start;
      through = end;
      continue;
    }
    if (start > dateAfter(through!, 1)) break;
    if (end > through!) through = end;
  }
  const state =
    attempts.size === 0
      ? 'not_started'
      : pending > 0
        ? 'importing'
        : failed > 0
          ? 'partial'
          : 'complete';
  return {
    connection_id: connectionId,
    state,
    total_windows: attempts.size,
    completed_windows: completed,
    failed_windows: failed,
    pending_windows: pending,
    covered_from: from,
    covered_through: through,
  };
}
