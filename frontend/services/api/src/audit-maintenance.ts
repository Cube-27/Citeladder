import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { auditRuntime } from './audits/config.ts';
import { auditProjections } from './audits/projections.ts';
import { AuditMaintenance } from './audits/maintenance.ts';
import { reconcileResearch } from './search-intelligence/maintenance.ts';
import { waitForPoll } from './workers/poll.ts';
import { getLogger } from './logging.ts';

const db = createDatabase(loadConfig()),
  stop = new AbortController();
const audits = new AuditMaintenance(db, auditProjections(db).finalize);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  while (!stop.signal.aborted) {
    try {
      await audits.runOnce();
      await reconcileResearch(db);
    } catch {
      getLogger('workers.audit_maintenance').info('maintenance_tick_failed');
    }
    await waitForPoll(auditRuntime().audits.poll_interval_seconds * 1000, stop.signal);
  }
} finally {
  await db.destroy();
}
