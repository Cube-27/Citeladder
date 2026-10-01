import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { SiteHealthWorker } from './workers/site-health-worker.ts';

const db = createDatabase(loadConfig());
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  await new SiteHealthWorker(db).runForever(stop.signal);
} finally {
  await db.destroy();
}
