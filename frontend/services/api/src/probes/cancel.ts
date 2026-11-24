import { cancelAudit } from '../audits/maintenance.ts';
import { auditProjections } from '../audits/projections.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { probeAudits } from './launches.ts';

export async function cancelProbe(db: Database, scope: Scope) {
  const active = await probeAudits(db, scope)
    .select('a.id')
    .where('a.status', 'in', policy.audits.constants.audit_active_statuses)
    .execute();
  if (!active.length) throw new ApiError(409, 'No probe is running', { code: 'probe_not_running' });
  for (const { id } of active) {
    const { finalize } = await cancelAudit(db, scope, id);
    if (finalize) await auditProjections(db).finalize(scope.workspaceId, id);
  }
}
