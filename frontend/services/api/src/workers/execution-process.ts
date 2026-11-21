import { setTimeout as sleep } from 'node:timers/promises';
import { loadConfig } from '../config.ts';
import { handoverLeadMs } from '../config/execution.ts';
import { createDatabase } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import {
  drainLanes,
  exclusiveDrain,
  LaneFailures,
  nextDueDelay,
  runnerOwners,
  tickAndDrain,
  type RunnerLane,
} from './runner.ts';
import { runnerStarter } from './start-runner.ts';

export async function runExecution(tick: boolean) {
  const config = loadConfig();
  const db = createDatabase(config, { execution: true });
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, shutdown);
  const deadline = performance.now() + config.execution.budgetSeconds * 1000;
  try {
    const options = { signal: stop.signal, deadline };
    const owners = await runnerOwners(db, config);
    const exclusive = exclusiveDrain(config, options);
    const start = runnerStarter(config, db);
    const budgetMs = config.execution.budgetSeconds * 1000;
    const drained = new AbortController();
    const handover = handOver({
      delayMs: deadline - handoverLeadMs - performance.now(),
      signal: AbortSignal.any([stop.signal, drained.signal]),
      successor: (signal) =>
        startSuccessor({ lanes: owners.lanes, budgetMs, signal, start: () => start('handover') }),
    });
    let tasks = 0;
    let failure: unknown = null;
    try {
      tasks = await (tick
        ? tickAndDrain(owners, options, exclusive)
        : exclusive(() => drainLanes(owners.lanes, options)));
    } catch (error) {
      failure = error;
      if (error instanceof LaneFailures) tasks = error.tasks;
    }
    drained.abort();
    const failed = failure instanceof LaneFailures ? failure.lanes : new Set<string>();
    const handedOver = await handover;
    const successor =
      handedOver ||
      (await startSuccessor({
        lanes: owners.lanes.filter((lane) => !failed.has(lane.name)),
        budgetMs,
        signal: stop.signal,
        start,
      }));
    getLogger('workers.runner').info('runner_completed', {
      tick,
      tasks,
      successor,
      handover: handedOver,
      failed_lanes: [...failed],
      failed: failure !== null,
      stopped: stop.signal.aborted,
      budget_exhausted: performance.now() >= deadline,
    });
    if (failure !== null) throw failure;
  } finally {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.removeListener(signal, shutdown);
    await db.destroy();
  }
}

export async function handOver(options: {
  delayMs: number;
  signal: AbortSignal;
  successor: (signal: AbortSignal) => Promise<boolean>;
}): Promise<boolean> {
  if (options.delayMs <= 0) return false;
  try {
    await sleep(options.delayMs, undefined, { signal: options.signal });
  } catch {
    return false;
  }
  return options.successor(options.signal);
}

export async function startSuccessor(options: {
  lanes: readonly RunnerLane[];
  budgetMs: number;
  signal: AbortSignal;
  start: () => Promise<boolean>;
}): Promise<boolean> {
  if (options.signal.aborted) return false;
  const due = await nextDueDelay(options.lanes);
  if (options.signal.aborted || due === null || due >= options.budgetMs) return false;
  return options.start();
}
