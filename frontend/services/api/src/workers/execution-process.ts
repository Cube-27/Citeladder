import { loadConfig } from '../config.ts';
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
    const failed = failure instanceof LaneFailures ? failure.lanes : new Set<string>();
    const successor = await startSuccessor({
      lanes: owners.lanes.filter((lane) => !failed.has(lane.name)),
      budgetMs: config.execution.budgetSeconds * 1000,
      signal: stop.signal,
      start: runnerStarter(config, db),
    });
    getLogger('workers.runner').info('runner_completed', {
      tick,
      tasks,
      successor,
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

/**
 * The drain lock is released: work due within a fresh budget gets a successor
 * now instead of waiting for the next tick. A failed lane is excluded, but the
 * owners that did not fail still get theirs. The starter skips an active drain.
 */
export async function startSuccessor(options: {
  lanes: readonly RunnerLane[];
  budgetMs: number;
  signal: AbortSignal;
  start: () => Promise<void>;
}): Promise<boolean> {
  if (options.signal.aborted) return false;
  const due = await nextDueDelay(options.lanes);
  // Shutdown may arrive while the probe runs; never start a successor after it.
  if (options.signal.aborted || due === null || due >= options.budgetMs) return false;
  await options.start();
  return true;
}
