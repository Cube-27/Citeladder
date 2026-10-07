import { loadConfig } from '../config.ts';
import { createDatabase } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { drainLanes, exclusiveDrain, nextDueDelay, runnerOwners, tickAndDrain } from './runner.ts';
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
    const tasks = await (tick
      ? tickAndDrain(owners, options, exclusive)
      : exclusive(() => drainLanes(owners.lanes, options)));
    // The drain lock is released: work due within a fresh budget gets a successor
    // now instead of waiting for the next tick. The starter skips an active drain.
    const due = stop.signal.aborted ? null : await nextDueDelay(owners.lanes);
    // Shutdown may arrive while the probe runs; never start a successor after it.
    const successor =
      !stop.signal.aborted && due !== null && due < config.execution.budgetSeconds * 1000;
    if (successor) await runnerStarter(config, db)();
    getLogger('workers.runner').info('runner_completed', {
      tick,
      tasks,
      successor,
      stopped: stop.signal.aborted,
      budget_exhausted: performance.now() >= deadline,
    });
  } finally {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.removeListener(signal, shutdown);
    await db.destroy();
  }
}
