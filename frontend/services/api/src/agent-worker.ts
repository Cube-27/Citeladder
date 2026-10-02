import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { createAgentBindings } from './agent/bindings.ts';
import { AgentWorker } from './workers/agent-worker.ts';

const db = createDatabase(loadConfig()),
  stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  const worker = new AgentWorker(db, await createAgentBindings(db));
  if (process.argv.includes('--drain')) await worker.runUntilIdle();
  else await worker.runForever(stop.signal);
} finally {
  await db.destroy();
}
