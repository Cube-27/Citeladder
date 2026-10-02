import { loadConfig } from '../config.ts';
import { createDatabase } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { drainLanes, runnerOwners, tickAndDrain } from './runner.ts';

export async function runExecution(tick: boolean) {
  const config = loadConfig();
  const db = createDatabase(config, { maxConnections: config.execution.poolSize });
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, shutdown);
  const deadline = performance.now() + config.execution.budgetSeconds * 1000;
  try {
    const owners = await runnerOwners(db, config);
    const options = { signal: stop.signal, deadline };
    const tasks = await (tick ? tickAndDrain(owners, options) : drainLanes(owners.lanes, options));
    getLogger('workers.runner').info('runner_completed', {
      tick,
      tasks,
      stopped: stop.signal.aborted,
      budget_exhausted: performance.now() >= deadline,
    });
  } finally {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.removeListener(signal, shutdown);
    await db.destroy();
  }
}
