import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadConfig, policy, resolveSettingSpec } from './config.ts';
import { createDatabase } from './db/database.ts';
import { auditRuntime } from './audits/config.ts';
import { AuditScheduler } from './workers/audit-scheduler.ts';

const db = createDatabase(loadConfig());
const heartbeatPath = String(resolveSettingSpec(policy.audit_schedules.heartbeat_path));
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
try {
  await new AuditScheduler(db, auditRuntime()).runForever(stop.signal, async (at) => {
    await mkdir(dirname(heartbeatPath), { recursive: true, mode: 0o700 });
    await writeFile(heartbeatPath, at.toISOString(), { mode: 0o600 });
  });
} finally {
  await db.destroy();
}
