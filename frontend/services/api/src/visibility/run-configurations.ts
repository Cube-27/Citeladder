import type { Database } from '../db/database.ts';
import { chunked } from '../lists.ts';

export async function runConfigurations(
  db: Database,
  scope: { workspaceId: string; projectId: string; auditIds: readonly string[] },
): Promise<Map<string, unknown>> {
  const rows = await chunked([...new Set(scope.auditIds)], (ids) =>
    db
      .selectFrom('audits')
      .select(['id', 'configuration'])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('id', 'in', ids)
      .execute(),
  );
  return new Map(rows.map((row) => [row.id, row.configuration]));
}
