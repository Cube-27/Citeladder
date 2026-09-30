import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { DiscoveryWorker } from './workers/discovery-worker.ts';

const db = createDatabase(loadConfig());
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  await new DiscoveryWorker(db).runForever(stop.signal);
} finally {
  await db.destroy();
}
