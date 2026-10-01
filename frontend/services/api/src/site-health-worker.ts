import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { SiteHealthWorker } from './workers/site-health-worker.ts';
import { parseArgs } from 'node:util';

const db = createDatabase(loadConfig());
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  const { values } = parseArgs({ options: { drain: { type: 'boolean', default: false } } });
  const worker = new SiteHealthWorker(db);
  if (values.drain) await worker.runUntilIdle(stop.signal);
  else await worker.runForever(stop.signal);
} finally {
  await db.destroy();
}
