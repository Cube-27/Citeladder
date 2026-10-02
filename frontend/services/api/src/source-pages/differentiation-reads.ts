/** Persisted comparisons are descriptive evidence; reads never inspect or recompute. */
import type { Database } from '../db/database.ts';
import type { Scope } from '../opportunities/sources.ts';
import { requireProject } from '../opportunities/reads.ts';

export async function listDifferentiationReports(db: Database, scope: Scope, limit: number) {
  await requireProject(db, scope);
  return db
    .selectFrom('content_differentiation_reports')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();
}
