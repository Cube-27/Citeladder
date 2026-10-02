import { parseArgs } from 'node:util';
import { loadConfig } from './config.ts';
import { queueRecovery } from './config/queue-recovery.ts';
import { createDatabase } from './db/database.ts';
import { recoverQueues } from './queue/recovery.ts';
import { waitForPoll } from './workers/poll.ts';

const db = createDatabase(loadConfig());
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  const { values } = parseArgs({ options: { drain: { type: 'boolean', default: false } } });
  do {
    await recoverQueues(db);
    if (values.drain) break;
    await waitForPoll(queueRecovery.pollSeconds * 1000, stop.signal);
  } while (!stop.signal.aborted);
} finally {
  await db.destroy();
}
