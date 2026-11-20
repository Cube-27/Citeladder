/**
 * Probe launches: one per Run probe or scheduled occurrence, an audit per
 * market sharing a `launch_id`. Reads group them, newest first, and derive
 * the launch's state from its runs and their labelling outcomes.
 */
import type { ProbeRun } from '@citeladder/contracts/probes';
import { sql } from 'kysely';

import { readFrozenConfiguration } from '../audits/frozen-configuration.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { logicalEngines } from '../providers/config.ts';

type Scope = { workspaceId: string; projectId: string };
const COMPLETED = ['completed', 'partially_completed'];

function probeAudits(db: Database, scope: Scope) {
  return db
    .selectFrom('audits as a')
    .where('a.workspace_id', '=', scope.workspaceId)
    .where('a.project_id', '=', scope.projectId)
    .where('a.audit_scope', '=', policy.probes.audit_scope)
    .where('a.launch_id', 'is not', null);
}

function launchState(audits: readonly { status: string; outcome: string | null }[]) {
  const terminal = policy.audits.constants.audit_terminal_statuses;
  if (audits.some((audit) => !terminal.includes(audit.status))) return 'running';
  const completed = audits.filter((audit) => COMPLETED.includes(audit.status));
  if (!completed.length) return 'failed';
  if (completed.some((audit) => audit.outcome === null)) return 'labelling';
  return completed.some((audit) => audit.outcome === 'labelled') ? 'ready' : 'unavailable';
}

/**
 * The newest `limit` probe launches, newest first; `labelled` keeps only
 * those with at least one labelled run, the ones Market and Objections read.
 */
export async function probeLaunches(
  db: Database,
  scope: Scope,
  { limit, labelled = false }: { limit: number; labelled?: boolean },
) {
  const recent = probeAudits(db, scope)
    .select('a.launch_id')
    .$if(labelled, (query) =>
      query.where(({ exists, selectFrom }) =>
        exists(
          selectFrom('probe_labellings as l')
            .select('l.id')
            .whereRef('l.audit_id', '=', 'a.id')
            .where('l.outcome', '=', 'labelled'),
        ),
      ),
    )
    .groupBy('a.launch_id')
    .orderBy(sql`max(a.created_at)`, 'desc')
    .limit(limit);
  const rows = await probeAudits(db, scope)
    .leftJoin('probe_labellings as l', 'l.audit_id', 'a.id')
    .select([
      'a.id',
      'a.launch_id',
      'a.status',
      'a.created_at',
      'a.completed_at',
      'a.completed_count',
      'a.configuration',
      'a.market_id',
      'l.outcome',
    ])
    .where('a.launch_id', 'in', recent)
    .orderBy('a.created_at', 'desc')
    .orderBy('a.id')
    .execute();
  const launches = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.launch_id!;
    launches.set(key, [...(launches.get(key) ?? []), row]);
  }
  return [...launches].map(([launchId, audits]) => launch(launchId, audits));
}

function launch(
  launchId: string,
  audits: readonly {
    id: string;
    status: string;
    created_at: Date;
    completed_at: Date | null;
    completed_count: number;
    configuration: unknown;
    market_id: string | null;
    outcome: string | null;
  }[],
) {
  const configs = audits.map((audit) => readFrozenConfiguration(audit.configuration));
  const engines = new Set(configs.flatMap((config) => config.engines ?? []));
  const finished = audits.map((audit) => audit.completed_at);
  const run: ProbeRun = {
    launch_id: launchId,
    audit_ids: audits.map((audit) => audit.id),
    state: launchState(audits),
    created_at: new Date(
      Math.min(...audits.map((audit) => audit.created_at.getTime())),
    ).toISOString(),
    completed_at: finished.includes(null)
      ? null
      : new Date(Math.max(...finished.map((at) => at!.getTime()))).toISOString(),
    engines: logicalEngines.filter((engine) => engines.has(engine)),
    markets: audits.map((audit, index) => ({
      id: audit.market_id,
      country_code: configs[index]!.country_code ?? '',
      language_code: configs[index]!.language_code ?? '',
    })),
    answers: audits.reduce((sum, audit) => sum + audit.completed_count, 0),
  };
  return {
    run,
    labelledIds: audits.filter((audit) => audit.outcome === 'labelled').map((audit) => audit.id),
  };
}
export type ProbeLaunch = ReturnType<typeof launch>;
