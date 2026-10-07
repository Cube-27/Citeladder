import { randomInt, randomUUID } from 'node:crypto';
import { crawlLogTick } from '../crawl-logs/maintenance.ts';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import {
  configEnvironment,
  loadWorkerSettings,
  policy,
  resolveSettingSpec,
  type ServiceConfig,
} from '../config.ts';
import { poolOptions, type Database } from '../db/database.ts';
import { createAgentBindings } from '../agent/bindings.ts';
import { auditRuntime } from '../audits/config.ts';
import { auditProjections } from '../audits/projections.ts';
import { AuditMaintenance } from '../audits/maintenance.ts';
import { recoverBilling } from '../billing/recovery.ts';
import { recoverQueues } from '../queue/recovery.ts';
import { reconcileResearch } from '../search-intelligence/maintenance.ts';
import { AnalyticsWorker } from './analytics-worker.ts';
import { DiscoveryWorker } from './discovery-worker.ts';
import { IntegrationWorker } from './integration-worker.ts';
import { IntegrationDispatcher } from './integration-dispatcher.ts';
import { AgentWorker } from './agent-worker.ts';
import { AuditWorker } from './audit-worker.ts';
import { AuditScheduler, schedulerSettings } from './audit-scheduler.ts';
import { SiteHealthWorker } from './site-health-worker.ts';
import { integrationSettings } from '../integrations/config.ts';
import { siteWorkerSettings } from '../site-health/runtime.ts';
import { getLogger } from '../logging.ts';
import { cleanupMcpProtocol } from '../mcp/maintenance.ts';
import { DRAIN_LOCK } from '../config/execution.ts';

export type RunnerLane = {
  name: string;
  run: (canAdmit: () => boolean) => Promise<number | boolean | void>;
  /** When this owner's earliest pending task becomes claimable; null when none is pending. */
  nextDue?: () => Promise<Date | null>;
};
type DrainOptions = {
  signal: AbortSignal;
  deadline: number;
  now?: () => number;
  firstLane?: number;
  /** Upper bound on one idle pause, so work committed meanwhile is still seen promptly. */
  idlePollMs?: number;
  pause?: (ms: number, signal: AbortSignal) => Promise<unknown>;
};

/** Milliseconds until the earliest pending task across lanes; null when none is pending. */
export async function nextDueDelay(
  lanes: readonly RunnerLane[],
  wallClock: () => number = Date.now,
): Promise<number | null> {
  let earliest: number | null = null;
  for (const lane of lanes) {
    if (!lane.nextDue) continue;
    try {
      const due = await lane.nextDue(); // NOSONAR -- One probe at a time keeps the shared pool free.
      if (due && (earliest === null || due.getTime() < earliest)) earliest = due.getTime();
    } catch {
      // The probe only extends a drain; tick still recovers anything it misses.
      getLogger('workers.runner').warning('runner_next_due_failed', { lane: lane.name });
    }
  }
  return earliest === null ? null : Math.max(0, earliest - wallClock());
}

/** Round-robin passes also catch successors enqueued into an earlier lane.
 * An idle drain keeps the execution while deferred work becomes due within the
 * budget; exiting would leave it for the next tick. Stop admitting at the
 * deadline; finish claimed work and retain all lease owners.
 */
export async function drainLanes(lanes: readonly RunnerLane[], options: DrainOptions) {
  const now = options.now ?? (() => performance.now());
  const canAdmit = () => !options.signal.aborted && now() < options.deadline;
  const pause =
    options.pause ??
    ((ms: number, signal: AbortSignal) => sleep(ms, undefined, { signal }).catch(() => undefined));
  const idlePollMs = options.idlePollMs ?? 5000;
  const failures: unknown[] = [];
  const failed = new Set<string>();
  const first = options.firstLane ?? randomInt(Math.max(1, lanes.length));
  let tasks = 0;
  while (canAdmit()) {
    let progress = 0;
    for (let offset = 0; offset < lanes.length; offset++) {
      if (!canAdmit()) break;
      const lane = lanes[(first + offset) % lanes.length]!;
      if (failed.has(lane.name)) continue;
      try {
        progress += Number((await lane.run(canAdmit)) ?? 0); // NOSONAR -- Sequential admission preserves the shared pool and budget.
      } catch (error) {
        // Attempt other owners, but leave an infrastructure failure visible to the job.
        failed.add(lane.name);
        failures.push(error);
        getLogger('workers.runner').warning('runner_lane_failed', { lane: lane.name });
      }
    }
    tasks += progress;
    if (progress || !canAdmit()) continue;
    const wait = await nextDueDelay(lanes.filter((lane) => !failed.has(lane.name)));
    if (wait === null || now() + wait >= options.deadline) break;
    // The floor stops a due-but-unclaimable row (locked by another claimer) from spinning.
    const ms = Math.min(Math.max(wait, 250), idlePollMs, options.deadline - now());
    await pause(ms, options.signal); // NOSONAR -- Idle until deferred work is due.
  }
  if (failures.length) throw new AggregateError(failures, 'Runner lanes failed');
  return tasks;
}

export type Exclusive = (drain: () => Promise<number>) => Promise<number>;

/**
 * Each committed write may start an execution; without this a burst would open
 * one pool per execution against the small database. A second execution waits
 * briefly, then leaves the work to the active drain, which revisits every lane
 * until idle. Tick recovers the rare start that lands after that final pass.
 * The lock lives on its own session so the drain keeps every pooled connection.
 */
export function exclusiveDrain(
  config: ServiceConfig,
  options: Pick<DrainOptions, 'signal' | 'deadline' | 'now'>,
  waitMs = config.execution.drainLockWaitMs,
): Exclusive {
  const now = options.now ?? (() => performance.now());
  return async (drain) => {
    const lock = new pg.Client(poolOptions(config));
    await lock.connect();
    try {
      const until = Math.min(now() + waitMs, options.deadline);
      for (;;) {
        const { rows } = await lock.query<{ locked: boolean }>( // NOSONAR -- Each attempt waits for the previous one.
          'select pg_try_advisory_lock(hashtextextended($1, 0)) as locked',
          [DRAIN_LOCK],
        );
        if (rows[0]?.locked) break;
        if (options.signal.aborted || now() >= until) {
          getLogger('workers.runner').info('runner_drain_active_elsewhere');
          return 0;
        }
        const pause = sleep(config.execution.drainLockPollMs, undefined, {
          signal: options.signal,
        });
        await pause.catch(() => undefined); // NOSONAR -- Polling interval between attempts.
      }
      try {
        return await drain();
      } finally {
        await lock.query('select pg_advisory_unlock(hashtextextended($1, 0))', [DRAIN_LOCK]);
      }
    } finally {
      await lock.end();
    }
  };
}

export async function runnerOwners(db: Database, config: ServiceConfig) {
  const env = configEnvironment(config);
  const runtime = auditRuntime(env);
  // Audit admission stays serial; Site Health below uses a pool-bounded batch.
  runtime.audits.worker_concurrency = config.execution.laneConcurrency;
  const projections = auditProjections(db);
  const analytics = new AnalyticsWorker(db, loadWorkerSettings(env));
  const discovery = new DiscoveryWorker(db, { env });
  const integration = new IntegrationWorker(db, undefined, integrationSettings(env));
  const agent = new AgentWorker(db, await createAgentBindings(db, env));
  const audit = new AuditWorker(
    db,
    runtime,
    String(resolveSettingSpec(policy.settings.encryption_key, env)),
    projections,
    { env },
  );
  const site = new SiteHealthWorker(db, { settings: siteWorkerSettings(env) });
  const owner = `runner-discovery:${randomUUID()}`;
  const maintenance = new AuditMaintenance(db, projections.finalize);
  const scheduler = new AuditScheduler(db, runtime, schedulerSettings(env));
  const dispatcher = new IntegrationDispatcher(db);
  return {
    lanes: [
      { name: 'analytics', run: () => analytics.runOnce() },
      { name: 'discovery', run: () => discovery.runOnce(owner) },
      { name: 'integrations', run: () => integration.runOnce() },
      { name: 'agent', run: () => agent.runOnce() },
      { name: 'audits', run: () => audit.runOnce() },
      {
        name: 'site-health',
        run: () => site.runOnce(Math.min(site.settings.concurrency, config.execution.poolSize)),
        nextDue: () => site.nextDue(),
      },
      {
        name: 'billing',
        run: async (canAdmit) =>
          Object.values(await recoverBilling(db, config, undefined, canAdmit)).reduce(
            (sum, count) => sum + count,
            0,
          ),
      },
    ] satisfies RunnerLane[],
    periodic: [
      {
        name: 'mcp-protocol-cleanup',
        run: (canAdmit) => cleanupMcpProtocol(db, new Date(), canAdmit),
      },
      { name: 'queue-recovery', run: (canAdmit) => recoverQueues(db, canAdmit) },
      {
        name: 'audit-maintenance',
        run: async (canAdmit) => {
          await maintenance.runOnce(new Date(), canAdmit);
          if (canAdmit()) await reconcileResearch(db, new Date(), canAdmit);
        },
      },
      { name: 'audit-scheduler', run: (canAdmit) => scheduler.runOnce(scheduler.now(), canAdmit) },
      { name: 'integration-dispatcher', run: (canAdmit) => dispatcher.runOnce(canAdmit) },
      { name: 'crawl-log-maintenance', run: (canAdmit) => crawlLogTick(db, new Date(), canAdmit) },
    ] satisfies RunnerLane[],
  };
}

/** Periodic work runs once, followed by the same drain with the remaining budget. */
export async function tickAndDrain(
  owners: { lanes: RunnerLane[]; periodic: RunnerLane[] },
  options: DrainOptions,
  exclusive: Exclusive = (drain) => drain(),
) {
  const failures: unknown[] = [];
  const now = options.now ?? (() => performance.now());
  const canAdmit = () => !options.signal.aborted && now() < options.deadline;
  for (const phase of owners.periodic) {
    if (options.signal.aborted || now() >= options.deadline) break;
    try {
      await phase.run(canAdmit); // NOSONAR -- Periodic phases share one admission budget and pool.
    } catch (error) {
      failures.push(error);
      getLogger('workers.runner').warning('tick_phase_failed', { phase: phase.name });
    }
  }
  let tasks = 0;
  try {
    tasks = await exclusive(() => drainLanes(owners.lanes, options));
  } catch (error) {
    failures.push(error);
  }
  if (failures.length) throw new AggregateError(failures, 'Tick failed');
  return tasks;
}
