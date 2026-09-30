import { setTimeout } from 'node:timers/promises';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { getLogger } from './logging.ts';
import { recoverBilling } from './billing/recovery.ts';

const config = loadConfig();
const db = createDatabase(config);
const stop = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop.abort());
try {
  do {
    try {
      const counts = await recoverBilling(db, config);
      getLogger('billing-worker').info('billing_recovery_completed', counts);
    } catch (error) {
      getLogger('billing-worker').exception('billing_recovery_failed', error);
      if (!process.argv.includes('--loop')) throw error;
    }
    if (!process.argv.includes('--loop')) break;
    // Sequential polling is the point: one sweep, then one interval.
    const interval = config.billing.pollSeconds * 1000;
    await setTimeout(interval, undefined, { signal: stop.signal }).catch(() => {}); // NOSONAR
  } while (!stop.signal.aborted);
} finally {
  await db.destroy();
}
