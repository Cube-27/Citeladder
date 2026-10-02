import { loadConfig } from './config.ts';
import { parseArgs } from 'node:util';
import { createDatabase } from './db/database.ts';
import { DiscoveryWorker } from './workers/discovery-worker.ts';

const db = createDatabase(loadConfig());
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  const { values } = parseArgs({ options: { drain: { type: 'boolean', default: false } } });
  const worker = new DiscoveryWorker(db);
  if (values.drain) await worker.runUntilIdle(stop.signal);
  else await worker.runForever(stop.signal);
} finally {
  await db.destroy();
}
