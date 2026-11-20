/**
 * A project's objection groups (AV-28): probes create them, people rename,
 * merge and delete them. Names are unique per project case-insensitively.
 * Merging moves every labelled reason onto the kept group; deleting a group
 * deletes its reasons, so it no longer reads as an objection.
 */
import { objectionGroupRequestSchema } from '@citeladder/contracts/probes';
import { z } from 'zod';

import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { isUniqueViolation } from '../db/errors.ts';
import { ApiError, notFound } from '../errors.ts';

type Scope = { workspaceId: string; projectId: string };

export const groupRequest = objectionGroupRequestSchema.extend({
  name: z
    .string()
    .transform((name) => name.replaceAll(/\s+/gu, ' ').trim())
    .pipe(z.string().min(1).max(policy.probes.group_name_max_chars)),
});

/** The project's groups, oldest first. */
export function listGroups(db: Database, scope: Scope) {
  return db
    .selectFrom('probe_objection_groups')
    .select(['id', 'name'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
}

export async function renameGroup(
  db: Database,
  scope: Scope & { groupId: string },
  input: z.output<typeof groupRequest>,
) {
  try {
    const row = await db
      .updateTable('probe_objection_groups')
      .set({ name: input.name, updated_at: new Date() })
      .where('id', '=', scope.groupId)
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .returning(['id', 'name'])
      .executeTakeFirst();
    if (!row) throw notFound('Objection group');
    return row;
  } catch (error) {
    if (isUniqueViolation(error, 'uq_probe_objection_group_name'))
      throw new ApiError(409, 'An objection group with this name already exists');
    throw error;
  }
}

/** Moves `groupId`'s reasons onto `intoId` and removes it; both must be the project's. */
export function mergeGroups(db: Database, scope: Scope & { groupId: string; intoId: string }) {
  if (scope.groupId === scope.intoId) throw new ApiError(400, 'Choose another group to merge into');
  return inTransaction(db, async (trx) => {
    const groups = await trx
      .selectFrom('probe_objection_groups')
      .select(['id', 'name'])
      .where('id', 'in', [scope.groupId, scope.intoId])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .orderBy('id')
      .forUpdate()
      .execute();
    const kept = groups.find((group) => group.id === scope.intoId);
    if (groups.length !== 2 || !kept) throw notFound('Objection group');
    await trx
      .updateTable('probe_answer_items')
      .set({ objection_group_id: scope.intoId })
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('objection_group_id', '=', scope.groupId)
      .execute();
    await trx
      .deleteFrom('probe_objection_groups')
      .where('id', '=', scope.groupId)
      .where('workspace_id', '=', scope.workspaceId)
      .execute();
    return kept;
  });
}

export async function deleteGroup(db: Database, scope: Scope & { groupId: string }) {
  const result = await db
    .deleteFrom('probe_objection_groups')
    .where('id', '=', scope.groupId)
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .executeTakeFirst();
  if (!result.numDeletedRows) throw notFound('Objection group');
}
