/** Trusted, explicit-target commercial operations. Caller never supplies actor rows. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Selectable } from 'kysely';
import type { BillingCatalogRevisions } from '../generated/db-schema.ts';
import type { Database } from '../db/database.ts';
import { operatorTransaction } from '../db/operator-transaction.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { requirePlatformAdmin } from '../auth/operators.ts';
import { getLogger } from '../logging.ts';
import { parseUuid } from '../http/uuid.ts';
import { jsonObject } from '../db/json.ts';
import { policy } from '../config.ts';
import { catalogAuthoring } from '../config/billing-authoring.ts';
import { catalog } from './catalog.ts';
import { validateCatalog, launchCatalog, catalogDigest as digest } from './catalog-authoring.ts';
import { issueBundle, revokeBundle, lockAccount } from '../entitlements/grants.ts';

const contextSchema = z.strictObject({
  actor: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(255),
  idempotencyKey: z.string().trim().min(1).max(255),
  apply: z.boolean().default(false),
});
export type OperatorContext = z.input<typeof contextSchema>;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        /secret|password|api[_-]?key|credential|token/iu.test(key) ? '[REDACTED]' : redact(v),
      ]),
    );
  return value;
}
export async function catalogDiff(db: Database, input: unknown) {
  const payload = validateCatalog(input);
  const current = await db
    .selectFrom('billing_catalog_revisions')
    .select(['revision', 'payload'])
    .where('publication_state', '=', 'published')
    .executeTakeFirst();
  return {
    current_revision: current?.revision ?? null,
    changed:
      !current ||
      digest(validateCatalog(jsonObject(current.payload, 'billing_catalog_revisions.payload'))) !==
        digest(payload),
  };
}
export type CatalogOperation =
  | { kind: 'import'; revision: string; payload: unknown }
  | { kind: 'seed'; mode: 'test' | 'live' | null; rate?: string }
  | { kind: 'publish'; revision: string };
type CatalogRow = Selectable<BillingCatalogRevisions>;
type ParsedContext = z.output<typeof contextSchema>;

async function checkCatalogReplay(
  db: Database,
  ctx: ParsedContext,
  actorId: string,
  revision: string,
  kind: CatalogOperation['kind'],
) {
  const prior = await db
    .selectFrom('billing_catalog_revisions')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb('created_idempotency_key', '=', ctx.idempotencyKey),
        eb('published_idempotency_key', '=', ctx.idempotencyKey),
      ]),
    )
    .executeTakeFirst();
  if (!prior) return;
  const publishing = kind === 'publish';
  const key = publishing ? prior.published_idempotency_key : prior.created_idempotency_key;
  if (key !== ctx.idempotencyKey) throw new Error('catalog_idempotency_operation_conflict');
  const recordedActor = publishing ? prior.published_by_user_id : prior.created_by_user_id;
  const reason = publishing ? prior.published_reason : prior.created_reason;
  if (prior.revision !== revision || recordedActor !== actorId || reason !== ctx.reason)
    throw new Error('catalog_idempotency_conflict');
}

async function importCatalog(
  db: Database,
  row: CatalogRow | undefined,
  ctx: ParsedContext,
  actorId: string,
  revision: string,
  operation: Exclude<CatalogOperation, { kind: 'publish' }>,
) {
  const payload = validateCatalog(
    operation.kind === 'seed'
      ? launchCatalog({ mode: operation.mode, rate: operation.rate })
      : operation.payload,
  );
  if (row) {
    if (
      digest(validateCatalog(jsonObject(row.payload, 'billing_catalog_revisions.payload'))) !==
      digest(payload)
    )
      throw new Error('catalog_revision_conflict');
    if (!row.created_idempotency_key) throw new Error('catalog_bootstrap_revision_exists');
    if (row.created_idempotency_key !== ctx.idempotencyKey)
      throw new Error('catalog_revision_conflict');
    return row;
  }
  return db
    .insertInto('billing_catalog_revisions')
    .values({
      id: randomUUID(),
      revision,
      payload: JSON.stringify(payload),
      payload_sha256: digest(payload),
      publication_state: 'draft',
      created_by_user_id: actorId,
      created_reason: ctx.reason,
      created_idempotency_key: ctx.idempotencyKey,
      created_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function publishCatalog(
  db: Database,
  row: CatalogRow | undefined,
  ctx: ParsedContext,
  actorId: string,
) {
  if (!row) throw new Error('catalog_revision_not_found');
  validateCatalog(jsonObject(row.payload, 'billing_catalog_revisions.payload'));
  if (row.publication_state === 'retired') throw new Error('catalog_forward_publication_required');
  if (row.published_idempotency_key && row.published_idempotency_key !== ctx.idempotencyKey)
    throw new Error('catalog_publication_conflict');
  if (row.publication_state === 'published') return row;
  await db
    .updateTable('billing_catalog_revisions')
    .set({ publication_state: 'retired' })
    .where('publication_state', '=', 'published')
    .execute();
  return db
    .updateTable('billing_catalog_revisions')
    .set({
      publication_state: 'published',
      published_by_user_id: actorId,
      published_reason: ctx.reason,
      published_idempotency_key: ctx.idempotencyKey,
      published_at: new Date(),
    })
    .where('id', '=', row.id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function catalogMutation(
  db: Database,
  context: OperatorContext,
  operation: CatalogOperation,
) {
  const ctx = contextSchema.parse(context);
  return operatorTransaction(db, ctx.apply, async (trx) => {
    const actor = await requirePlatformAdmin(trx, ctx.actor);
    await subjectXactLock(trx, 'billing.catalog.publication');
    const revision = z
      .string()
      .trim()
      .min(1)
      .max(64)
      .parse(operation.kind === 'seed' ? catalogAuthoring.revision : operation.revision);
    await checkCatalogReplay(trx, ctx, actor.id, revision, operation.kind);
    const existing = await trx
      .selectFrom('billing_catalog_revisions')
      .selectAll()
      .where('revision', '=', revision)
      .forUpdate()
      .executeTakeFirst();
    const row =
      operation.kind === 'publish'
        ? await publishCatalog(trx, existing, ctx, actor.id)
        : await importCatalog(trx, existing, ctx, actor.id, revision, operation);
    getLogger('api.billing.operator').info('billing.catalog', {
      actor_id: actor.id,
      operation: operation.kind,
      revision,
      reason: ctx.reason,
      idempotency_key: ctx.idempotencyKey,
      dry_run: !ctx.apply,
    });
    return { revision: row.revision, state: row.publication_state };
  });
}
const uuid = z.string().transform(parseUuid).pipe(z.string());
const targetSchema = z.strictObject({ workspaceId: uuid, accountId: uuid });
export function grantMutation(
  db: Database,
  context: OperatorContext,
  target: z.input<typeof targetSchema>,
  operation:
    | { kind: 'grant'; key: string; value: number; from: Date; until: Date | null }
    | { kind: 'revoke'; grantId: string; at: Date },
) {
  const ctx = contextSchema.parse(context);
  const scope = targetSchema.parse(target);
  return operatorTransaction(db, ctx.apply, async (trx) => {
    const actor = await requirePlatformAdmin(trx, ctx.actor);
    await lockAccount(trx, scope.workspaceId, scope.accountId);
    if (operation.kind === 'grant') {
      if (
        !Number.isFinite(operation.from.getTime()) ||
        (operation.until &&
          (!Number.isFinite(operation.until.getTime()) || operation.until <= operation.from))
      )
        throw new Error('invalid_grant_validity');
      const rows = await issueBundle(trx, {
        ...scope,
        key: ctx.idempotencyKey,
        sourceKind: 'override',
        sourceRef: `override:${actor.id}`,
        specs: [{ key: operation.key, value: operation.value }],
        revision: policy.entitlements.registry_revision,
        from: operation.from,
        until: operation.until,
        primary: false,
        profile: '',
        priority: 0,
      });
      getLogger('api.billing.operator').info(
        ctx.apply ? 'billing.override_grant_issued' : 'billing.override_grant_previewed',
        {
          actor_id: actor.id,
          account_id: scope.accountId,
          reason: ctx.reason,
          dry_run: !ctx.apply,
        },
      );
      return { grant_ids: rows.map((row) => row.id) };
    }
    await revokeBundle(trx, {
      ...scope,
      grantIds: [uuid.parse(operation.grantId)],
      key: ctx.idempotencyKey,
      reason: ctx.reason,
      actorKind: 'operator',
      actorId: actor.id,
      at: operation.at,
    });
    const rows = await trx
      .selectFrom('grant_revocations')
      .select('id')
      .where('grant_id', '=', operation.grantId)
      .where('idempotency_key', '=', ctx.idempotencyKey)
      .execute();
    return { revocation_ids: rows.map((row) => row.id) };
  });
}
export function inspectAccount(
  db: Database,
  context: OperatorContext,
  target: z.input<typeof targetSchema>,
) {
  const ctx = contextSchema.parse(context);
  const scope = targetSchema.parse(target);
  return operatorTransaction(db, false, async (trx) => {
    await requirePlatformAdmin(trx, ctx.actor);
    const account = await trx
      .selectFrom('billing_accounts')
      .select(['id', 'status'])
      .where('id', '=', scope.accountId)
      .where('workspace_id', '=', scope.workspaceId)
      .executeTakeFirstOrThrow();
    const rows = await trx
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', account.id)
      .execute();
    return { account_id: account.id, status: account.status, grant_ids: rows.map((row) => row.id) };
  });
}

/** Run after the Python identity transaction commits. Skip branches stay catalog-free. */
export function initializeCatalog(db: Database, actorEmail: string, mode: 'test' | 'live' | null) {
  return db.transaction().execute(async (trx) => {
    const actor = await requirePlatformAdmin(trx, actorEmail);
    await subjectXactLock(trx, 'billing.catalog.publication');
    const current = await trx
      .selectFrom('billing_catalog_revisions')
      .select('revision')
      .where('publication_state', '=', 'published')
      .executeTakeFirst();
    if (current) {
      return catalog(trx, current.revision);
    }
    // Nested transactions are unnecessary: use the same locked transaction and
    // authoritative validation for idempotent initialization.
    const revision = catalogAuthoring.revision;
    let draft = await trx
      .selectFrom('billing_catalog_revisions')
      .selectAll()
      .where('revision', '=', revision)
      .executeTakeFirst();
    if (draft?.publication_state === 'retired')
      throw new Error('catalog_forward_publication_required');
    if (!draft) {
      const payload = launchCatalog({ mode });
      draft = await trx
        .insertInto('billing_catalog_revisions')
        .values({
          id: randomUUID(),
          revision,
          payload: JSON.stringify(payload),
          payload_sha256: digest(payload),
          publication_state: 'draft',
          created_by_user_id: actor.id,
          created_reason: 'initialize approved pricing for a provisioned environment',
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    validateCatalog(jsonObject(draft.payload, 'billing_catalog_revisions.payload'));
    await trx
      .updateTable('billing_catalog_revisions')
      .set({
        publication_state: 'published',
        published_by_user_id: actor.id,
        published_reason: 'initialize approved pricing for a provisioned environment',
        published_at: new Date(),
      })
      .where('id', '=', draft.id)
      .execute();
    return catalog(trx, revision);
  });
}
