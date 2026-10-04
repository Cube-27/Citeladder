import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from 'kysely';
import { epochMicros, isoformat, parseDatetime } from '../http/datetimes.ts';
import type { Database } from '../db/database.ts';
import { operatorTransaction } from '../db/operator-transaction.ts';
import { requirePlatformAdmin } from '../auth/operators.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { WorkspaceContext } from '../auth/workspace.ts';
import { parseUuid } from '../http/uuid.ts';

const uuidSchema = z.string().trim().transform(parseUuid).pipe(z.string());

export const agreementReferenceSchema = z.strictObject({
  workspace_id: uuidSchema,
  signatory_id: uuidSchema,
  reference: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
  document_sha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/u),
  signed_at: z.iso.datetime({ offset: true }).refine((value) => {
    const parsed = parseDatetime(value);
    return parsed !== null && epochMicros(parsed) <= BigInt(Date.now()) * 1000n;
  }, 'A signed agreement must have a valid signature date in the past'),
  authority_verified: z.literal(true),
});

export function recordAgreementReference(
  db: Database,
  actorEmail: string,
  input: unknown,
  apply = false,
) {
  const payload = agreementReferenceSchema.parse(input);
  const signedAt = isoformat(parseDatetime(payload.signed_at)!);
  return operatorTransaction(db, apply, async (trx) => {
    const actor = await requirePlatformAdmin(trx, actorEmail);
    const workspace = await trx
      .selectFrom('workspaces')
      .select('id')
      .where('id', '=', payload.workspace_id)
      .where('is_system', '=', false)
      .forUpdate()
      .executeTakeFirst();
    const member = await trx
      .selectFrom('workspace_members')
      .innerJoin('users', 'users.id', 'workspace_members.user_id')
      .select('workspace_members.role')
      .where('workspace_id', '=', payload.workspace_id)
      .where('user_id', '=', payload.signatory_id)
      .where('users.is_active', '=', true)
      .forUpdate()
      .executeTakeFirst();
    if (
      !workspace ||
      !member ||
      !new WorkspaceContext(workspace.id, member.role).allows('manage_members')
    )
      throw new Error('An active authorized signatory in the target workspace is required');
    const values = {
      workspace_id: payload.workspace_id,
      signatory_id: payload.signatory_id,
      reference: payload.reference,
      document_sha256: payload.document_sha256,
      signed_at: sql<Date>`${signedAt}::timestamptz`,
    };
    const inserted = await trx
      .insertInto('enterprise_agreement_references')
      .values({ ...values, id: randomUUID(), actor_id: actor.id, recorded_at: new Date() })
      .onConflict((conflict) => conflict.columns(['workspace_id', 'reference']).doNothing())
      .returning('id')
      .executeTakeFirst();
    const row = await trx
      .selectFrom('enterprise_agreement_references')
      .selectAll()
      .select(sql<boolean>`signed_at = ${signedAt}::timestamptz`.as('sameSignedAt'))
      .where('workspace_id', '=', payload.workspace_id)
      .where('reference', '=', payload.reference)
      .executeTakeFirstOrThrow();
    if (
      row.signatory_id !== values.signatory_id ||
      row.document_sha256 !== values.document_sha256 ||
      !row.sameSignedAt
    )
      throw new Error('Agreement reference already names different signed evidence');
    if (inserted)
      await recordSecurityEvent(trx, 'policy.enterprise_reference', actor.id, workspace.id, row.id);
    return row;
  });
}
