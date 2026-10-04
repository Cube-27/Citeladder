import { randomUUID } from 'node:crypto';
import type { Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { operatorTransaction } from '../db/operator-transaction.ts';
import { requirePlatformAdmin } from '../auth/operators.ts';
import type { ProviderConnections } from '../generated/db-schema.ts';
import { compareText } from '../text-order.ts';
import { providerPolicy } from './config.ts';

type Status = 'created' | 'updated' | 'unchanged';
const referencePolicy = providerPolicy.platform_credential_reference;

async function systemWorkspace(db: Database, now: Date) {
  const existing = await db
    .selectFrom('workspaces')
    .selectAll()
    .where('is_system', '=', true)
    .forUpdate()
    .executeTakeFirst();
  if (existing) return existing;
  return db
    .insertInto('workspaces')
    .values({
      id: randomUUID(),
      name: providerPolicy.system_workspace_name,
      is_system: true,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function ensureConnection(
  db: Database,
  workspaceId: string,
  transport: string,
  reference: string,
  now: Date,
) {
  const prior = await db
    .selectFrom('provider_connections')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('credential_source', '=', 'platform')
    .where('transport_provider', '=', transport)
    .forUpdate()
    .executeTakeFirst();
  const rotated = prior && prior.platform_credential_ref !== reference;
  let status: Status = 'created';
  if (prior) status = !prior.active || rotated || prior.api_key_encrypted ? 'updated' : 'unchanged';
  const values = {
    active: true,
    api_key_encrypted: '',
    platform_credential_ref: reference,
    updated_at: now,
    ...(rotated
      ? {
          credential_revision: randomUUID(),
          paused_at: null,
          pause_until: null,
          pause_reason: '',
          // A reference is not a successful probe. Never carry verification across rotation.
          last_test_status: '',
          last_tested_at: null,
        }
      : {}),
  };
  if (prior) {
    const connection = await db
      .updateTable('provider_connections')
      .set(values)
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', prior.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { connection, status };
  }
  const connection = await db
    .insertInto('provider_connections')
    .values({
      ...values,
      id: randomUUID(),
      workspace_id: workspaceId,
      transport_provider: transport,
      credential_source: 'platform',
      credential_revision: randomUUID(),
      label: `platform ${transport} metadata`,
      base_url: '',
      // Metadata provisioning makes no provider call and cannot certify credentials.
      last_test_status: '',
      last_tested_at: null,
      paused_at: null,
      pause_until: null,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { connection, status };
}

async function ensureRoute(
  db: Database,
  connection: Selectable<ProviderConnections>,
  engine: string,
  approved: { transport_provider: string; transport_model: string },
  now: Date,
) {
  const route = await db
    .selectFrom('provider_routes')
    .selectAll()
    .where('workspace_id', '=', connection.workspace_id)
    .where('connection_id', '=', connection.id)
    .where('logical_engine', '=', engine)
    .executeTakeFirst();
  const values = {
    transport_provider: approved.transport_provider,
    transport_model: approved.transport_model,
    active: true,
    is_default: true,
    updated_at: now,
  };
  if (route) {
    await db
      .updateTable('provider_routes')
      .set(values)
      .where('id', '=', route.id)
      .where('workspace_id', '=', connection.workspace_id)
      .execute();
    return (
      route.transport_model !== approved.transport_model ||
      route.transport_provider !== approved.transport_provider ||
      !route.active ||
      !route.is_default
    );
  }
  await db
    .insertInto('provider_routes')
    .values({
      ...values,
      id: randomUUID(),
      workspace_id: connection.workspace_id,
      connection_id: connection.id,
      logical_engine: engine,
      created_at: now,
    })
    .execute();
  return true;
}

async function ensureTransport(
  db: Database,
  workspaceId: string,
  transport: string,
  reference: string,
  now: Date,
) {
  const result = await ensureConnection(db, workspaceId, transport, reference, now);
  for (const [engine, approved] of Object.entries(providerPolicy.routes)) {
    if (approved.transport_provider !== transport) continue;
    const changed = await ensureRoute(db, result.connection, engine, approved, now);
    if (changed && result.status === 'unchanged') result.status = 'updated';
  }
  return {
    transport_provider: transport,
    connection_id: result.connection.id,
    status: result.status,
  };
}

/** Deployment-owned metadata only; never reads keys or uses customer BYOK custody. */
export function provisionPlatformConnections(
  db: Database,
  actorEmail: string,
  references: Record<string, string>,
  options: { apply?: boolean } = {},
) {
  for (const [transport, reference] of Object.entries(references)) {
    if (!providerPolicy.transports.includes(transport)) throw new Error('unknown transport');
    if (
      !reference.trim() ||
      reference.trim().length > referencePolicy.max_chars ||
      new RegExp(referencePolicy.secret_pattern, 'iu').test(reference)
    )
      throw new Error('credential reference must be a non-secret opaque name');
  }
  return operatorTransaction(db, options.apply === true, async (trx) => {
    await requirePlatformAdmin(trx, actorEmail);
    await subjectXactLock(trx, 'platform.provider.provision');
    const now = new Date();
    const workspace = await systemWorkspace(trx, now);
    const reports = [];
    for (const transport of Object.keys(references).sort(compareText)) {
      reports.push(
        await ensureTransport(trx, workspace.id, transport, references[transport]!.trim(), now),
      );
    }
    return reports;
  });
}
