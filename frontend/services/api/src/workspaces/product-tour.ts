import { productTourStatusSchema } from '@citeladder/contracts/auth';
import { z } from 'zod';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { lockAuthorizedWorkspace, type Member } from './service.ts';

export const tourUpdate = z
  .object({
    version: z.string().min(1).max(32),
    status: productTourStatusSchema,
    step_id: z.string().max(64).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.version !== policy.workspaces.tour_version)
      context.addIssue({
        code: 'custom',
        path: ['version'],
        message: 'version must match the current product tour',
      });
    if (value.status === 'in_progress' && !value.step_id)
      context.addIssue({
        code: 'custom',
        path: ['step_id'],
        message: 'step_id is required while a tour is in progress',
      });
  });

function tourView(member: Member) {
  const current = member.product_tour_version === policy.workspaces.tour_version;
  const status = productTourStatusSchema.parse(member.product_tour_status);
  return {
    workspace_id: member.workspace_id,
    version: policy.workspaces.tour_version,
    status: current ? status : ('not_started' as const),
    step_id: current && status === 'in_progress' ? member.product_tour_step_id : null,
    started_at: current ? (member.product_tour_started_at?.toISOString() ?? null) : null,
    completed_at: current ? (member.product_tour_completed_at?.toISOString() ?? null) : null,
  };
}

export async function productTour(db: Database, workspaceId: string, actorId: string) {
  return tourView(
    await db
      .selectFrom('workspace_members')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', actorId)
      .executeTakeFirstOrThrow(),
  );
}

export function updateProductTour(
  db: Database,
  workspaceId: string,
  actorId: string,
  update: z.infer<typeof tourUpdate>,
) {
  return db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, workspaceId, actorId, 'read');
    const member = await trx
      .selectFrom('workspace_members')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', actorId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const now = new Date();
    const started =
      member.product_tour_version === update.version
        ? (member.product_tour_started_at ?? now)
        : now;
    const terminal = update.status === 'completed' || update.status === 'skipped';
    const row = await trx
      .updateTable('workspace_members')
      .set({
        product_tour_version: update.version,
        product_tour_status: update.status,
        product_tour_step_id: terminal ? null : (update.step_id ?? null),
        product_tour_started_at: update.status === 'not_started' ? null : started,
        product_tour_completed_at: terminal ? now : null,
        updated_at: now,
      })
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', member.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return tourView(row);
  });
}
