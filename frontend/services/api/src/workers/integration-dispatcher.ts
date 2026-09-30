import { randomUUID } from 'node:crypto';

import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { IntegrationClient } from '../integrations/client.ts';
import { endpoints, integrationSettings } from '../integrations/config.ts';
import { enqueueSyncRun } from '../integrations/sync.ts';
import { getLogger } from '../logging.ts';

const logger = getLogger('workers.integration-dispatcher');
const settings = integrationSettings();
const client = new IntegrationClient();

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function addDays(value: string, amount: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + amount * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export class IntegrationDispatcher {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async runOnce(): Promise<void> {
    await this.#schedule();
    await this.#revoke();
  }

  async runForever(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.runOnce();
      } catch (error) {
        logger.exception('integration_dispatcher_iteration_failed', error);
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, settings.dispatcher_interval_seconds * 1000);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }

  async #schedule(): Promise<void> {
    const targets = await this.#db
      .selectFrom('integration_property_mappings as mapping')
      .innerJoin('integration_connections as connection', 'connection.id', 'mapping.connection_id')
      .innerJoin('integration_oauth_grants as grant', (join) =>
        join
          .onRef('grant.id', '=', 'connection.grant_id')
          .onRef('grant.workspace_id', '=', 'connection.workspace_id'),
      )
      .select([
        'mapping.id as mapping_id',
        'mapping.workspace_id',
        'mapping.connection_id',
        'mapping.project_id',
      ])
      .where('mapping.status', '=', 'active')
      .where('grant.status', '=', 'connected')
      .where('connection.provider', 'in', ['gsc', 'ga4', 'bing'])
      .execute();
    const now = new Date();
    const end = day(new Date(now.getTime() - 86_400_000));
    const start = addDays(end, -(settings.sync_default_window_days - 1));
    for (const target of targets) {
      const previous = await this.#db
        .selectFrom('integration_sync_runs')
        .select('created_at')
        .where('mapping_id', '=', target.mapping_id)
        .where('sync_kind', '=', 'scheduled')
        .orderBy('created_at', 'desc')
        .executeTakeFirst();
      if (
        previous &&
        now.getTime() - new Date(previous.created_at).getTime() <
          settings.sync_cadence_seconds * 1000
      )
        continue;
      try {
        await enqueueSyncRun(this.#db, {
          workspaceId: target.workspace_id,
          connectionId: target.connection_id,
          mappingId: target.mapping_id,
          projectId: target.project_id,
          syncKind: 'scheduled',
          windowStart: start,
          windowEnd: end,
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'sync_active_window_conflict') continue;
        throw error;
      }
    }
  }

  async #revoke(): Promise<void> {
    const grants = await this.#db
      .selectFrom('integration_oauth_grants')
      .select(['id', 'workspace_id'])
      .where('status', '=', 'pending_revocation')
      .where((eb) =>
        eb.or([
          eb('refresh_claim_id', 'is', null),
          eb('refresh_claim_expires_at', '<=', new Date()),
        ]),
      )
      .limit(20)
      .execute();
    for (const candidate of grants) await this.#revokeGrant(candidate.id, candidate.workspace_id);
  }

  async #revokeGrant(grantId: string, workspaceId: string): Promise<void> {
    const claimId = randomUUID();
    const grant = await this.#db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('integration_oauth_grants')
        .selectAll()
        .where('id', '=', grantId)
        .where('workspace_id', '=', workspaceId)
        .forUpdate()
        .executeTakeFirst();
      if (
        !row ||
        row.status !== 'pending_revocation' ||
        (row.refresh_claim_expires_at &&
          new Date(row.refresh_claim_expires_at).getTime() > Date.now())
      )
        return null;
      await trx
        .updateTable('integration_oauth_grants')
        .set({
          refresh_claim_id: claimId,
          refresh_claim_expires_at: new Date(
            Date.now() + settings.token_refresh_claim_seconds * 1000,
          ),
        })
        .where('id', '=', grantId)
        .where('workspace_id', '=', workspaceId)
        .execute();
      return row;
    });
    if (!grant) return;
    try {
      const token = client.secrets.cipher.decrypt(
        grant.refresh_token_encrypted || grant.access_token_encrypted,
      );
      await client.revoke(
        grant.transport as keyof typeof endpoints.INTEGRATION_OAUTH_REVOKE_URLS,
        token,
      );
      await this.#db.transaction().execute(async (trx) => {
        const updated = await trx
          .updateTable('integration_oauth_grants')
          .set({
            status: 'revoked',
            access_token_encrypted: '',
            refresh_token_encrypted: '',
            token_expires_at: null,
            refresh_claim_id: null,
            refresh_claim_expires_at: null,
            token_revision: grant.token_revision + 1,
            updated_at: new Date(),
          })
          .where('id', '=', grantId)
          .where('workspace_id', '=', workspaceId)
          .where('refresh_claim_id', '=', claimId)
          .where('token_revision', '=', grant.token_revision)
          .returning('id')
          .executeTakeFirst();
        if (updated)
          await trx
            .insertInto('integration_events')
            .values({
              id: randomUUID(),
              workspace_id: workspaceId,
              connection_id: null,
              grant_id: grantId,
              event_type: 'integration.revoked',
              message: 'Integration grant revoked',
              payload: null,
              created_at: new Date(),
            })
            .execute();
      });
    } catch (error) {
      await this.#db.transaction().execute(async (trx) => {
        await trx
          .updateTable('integration_oauth_grants')
          .set({ refresh_claim_id: null, refresh_claim_expires_at: null, updated_at: new Date() })
          .where('id', '=', grantId)
          .where('workspace_id', '=', workspaceId)
          .where('refresh_claim_id', '=', claimId)
          .execute();
        await trx
          .insertInto('integration_events')
          .values({
            id: randomUUID(),
            workspace_id: workspaceId,
            connection_id: null,
            grant_id: grantId,
            event_type: 'integration.revoke_failed',
            message: 'Integration grant revocation failed',
            payload: JSON.stringify({
              error_code: error instanceof Error ? error.name : 'provider_api_error',
            }),
            created_at: new Date(),
          })
          .execute();
      });
      logger.warning('integration_revoke_failed', { grant_id: grantId });
    }
  }
}
