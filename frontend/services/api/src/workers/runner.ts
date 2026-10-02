import { randomInt, randomUUID } from 'node:crypto';
import {
  configEnvironment,
  loadWorkerSettings,
  policy,
  resolveSettingSpec,
  type ServiceConfig,
} from '../config.ts';
import type { Database } from '../db/database.ts';
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

export type RunnerLane = {
  name: string;
  run: (canAdmit: () => boolean) => Promise<number | boolean | void>;
};
type DrainOptions = {
  signal: AbortSignal;
  deadline: number;
  now?: () => number;
  firstLane?: number;
};

/** Round-robin passes also catch successors enqueued into an earlier lane.
 * Stop admitting at the deadline; finish claimed work and retain all lease owners.
 */
export async function drainLanes(lanes: readonly RunnerLane[], options: DrainOptions) {
  const now = options.now ?? (() => performance.now());
  const canAdmit = () => !options.signal.aborted && now() < options.deadline;
  const failures: unknown[] = [];
  const failed = new Set<string>();
  const first = options.firstLane ?? randomInt(Math.max(1, lanes.length));
  let tasks = 0;
  let progress: number;
  do {
    progress = 0;
    for (let offset = 0; offset < lanes.length; offset++) {
      if (options.signal.aborted || now() >= options.deadline) break;
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
  } while (progress && !options.signal.aborted && now() < options.deadline);
  if (failures.length) throw new AggregateError(failures, 'Runner lanes failed');
  return tasks;
}

export async function runnerOwners(db: Database, config: ServiceConfig) {
  const env = configEnvironment(config);
  const runtime = auditRuntime(env);
  // Each lane admits one task at a time; the shared pool retains room for heartbeat/settlement.
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
      { name: 'site-health', run: () => site.runOnce(config.execution.laneConcurrency) },
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
    ] satisfies RunnerLane[],
  };
}

/** Periodic work runs once, followed by the same drain with the remaining budget. */
export async function tickAndDrain(
  owners: { lanes: RunnerLane[]; periodic: RunnerLane[] },
  options: DrainOptions,
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
    tasks = await drainLanes(owners.lanes, options);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length) throw new AggregateError(failures, 'Tick failed');
  return tasks;
}
