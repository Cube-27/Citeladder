import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { operatorTransaction } from '../db/operator-transaction.ts';
import { providerPolicy } from './config.ts';

/** Deployment-owned metadata only; never reads keys or uses customer BYOK custody. */
export function provisionPlatformConnections(
  db: Database,
  references: Record<string, string>,
  dryRun = false,
) {
  for (const [transport, reference] of Object.entries(references)) {
    if (!providerPolicy.transports.includes(transport)) throw new Error('unknown transport');
    if (
      !reference.trim() ||
      reference.trim().length > 255 ||
      /sk-|secret|password/iu.test(reference)
    )
      throw new Error('credential reference must be a non-secret opaque name');
  }
  return operatorTransaction(db, !dryRun, async (trx) => {
    await subjectXactLock(trx, 'platform.provider.provision');
    const now = new Date();
    const workspace =
      (await trx
        .selectFrom('workspaces')
        .selectAll()
        .where('is_system', '=', true)
        .forUpdate()
        .executeTakeFirst()) ??
      (await trx
        .insertInto('workspaces')
        .values({
          id: randomUUID(),
          name: providerPolicy.system_workspace_name,
          is_system: true,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow());
    const reports = [];
    for (const transport of Object.keys(references).sort()) {
      const reference = references[transport]!.trim();
      const prior = await trx
        .selectFrom('provider_connections')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('credential_source', '=', 'platform')
        .where('transport_provider', '=', transport)
        .forUpdate()
        .executeTakeFirst();
      const rotated = prior && prior.platform_credential_ref !== reference;
      let status = prior
        ? !prior.active || rotated || prior.api_key_encrypted
          ? 'updated'
          : 'unchanged'
        : 'created';
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
              last_test_status: '',
              last_tested_at: null,
            }
          : {}),
      };
      const connection = prior
        ? await trx
            .updateTable('provider_connections')
            .set(values)
            .where('workspace_id', '=', workspace.id)
            .where('id', '=', prior.id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : await trx
            .insertInto('provider_connections')
            .values({
              ...values,
              id: randomUUID(),
              workspace_id: workspace.id,
              transport_provider: transport,
              credential_source: 'platform',
              credential_revision: randomUUID(),
              label: `platform ${transport} metadata`,
              base_url: '',
              last_test_status: '',
              last_tested_at: null,
              paused_at: null,
              pause_until: null,
              created_at: now,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
      for (const [engine, approved] of Object.entries(providerPolicy.routes)) {
        if (approved.transport_provider !== transport) continue;
        const route = await trx
          .selectFrom('provider_routes')
          .selectAll()
          .where('workspace_id', '=', workspace.id)
          .where('connection_id', '=', connection.id)
          .where('logical_engine', '=', engine)
          .executeTakeFirst();
        const routeValues = {
          transport_provider: transport,
          transport_model: approved.transport_model,
          active: true,
          is_default: true,
          updated_at: now,
        };
        if (route) {
          if (
            route.transport_model !== approved.transport_model ||
            route.transport_provider !== transport ||
            !route.active ||
            !route.is_default
          )
            status = status === 'created' ? status : 'updated';
          await trx
            .updateTable('provider_routes')
            .set(routeValues)
            .where('id', '=', route.id)
            .where('workspace_id', '=', workspace.id)
            .execute();
        } else {
          if (status === 'unchanged') status = 'updated';
          await trx
            .insertInto('provider_routes')
            .values({
              ...routeValues,
              id: randomUUID(),
              workspace_id: workspace.id,
              connection_id: connection.id,
              logical_engine: engine,
              created_at: now,
            })
            .execute();
        }
      }
      reports.push({ transport_provider: transport, connection_id: connection.id, status });
    }
    return reports;
  });
}
