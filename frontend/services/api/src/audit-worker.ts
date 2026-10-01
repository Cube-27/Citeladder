import { loadConfig, policy, resolveSettingSpec } from './config.ts';
import { createDatabase } from './db/database.ts';
import { auditRuntime } from './audits/config.ts';
import { auditProjections } from './audits/projections.ts';
import { AuditWorker } from './workers/audit-worker.ts';

const db = createDatabase(loadConfig());
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  await new AuditWorker(
    db,
    auditRuntime(),
    String(resolveSettingSpec(policy.settings.encryption_key)),
    auditProjections(db),
  ).runForever(stop.signal);
} finally {
  await db.destroy();
}
