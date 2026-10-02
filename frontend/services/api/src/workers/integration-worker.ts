import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import { queueRecovery } from '../config/queue-recovery.ts';
import { recoverIntegrationLeases } from '../queue/recovery.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import type { ImportPage } from '../integrations/client.ts';
import type { Dataset, IntegrationProvider } from '../integrations/config.ts';
import { IntegrationClient, IntegrationError } from '../integrations/client.ts';
import { integrationPolicy, integrationSettings } from '../integrations/config.ts';
import { freshAccessToken } from '../integrations/tokens.ts';
import { normalizedRows } from '../integrations/normalize.ts';
import {
  activeSyncTarget,
  artifactOffset,
  selectedItemDataset,
} from '../integrations/sync-state.ts';
import { enqueuePostSyncProjections } from '../integrations/projections.ts';
import { waitForPoll } from './poll.ts';

const logger = getLogger('workers.integrations');
const statuses = policy.task_queue.statuses;
const templates = Object.values(integrationPolicy.datasets);
const excluded = new Set(integrationPolicy.excluded_datasets);

type Run = {
  id: string;
  workspace_id: string;
  connection_id: string;
  mapping_id: string;
  project_id: string;
  property_ref: string;
  sync_kind: string;
  window_start: string;
  window_end: string;
  resync_seq: number;
  attempt_count: number;
  max_attempts: number;
};

function valueDate(value: string): string {
  return value.slice(0, 10);
}

type Artifact = { dataset: string; query_snapshot: unknown; row_count: number };
type Lease = { status: string; lease_owner: string | null; lease_live: boolean | null };

function ownsLease(current: Lease | undefined, owner: string): boolean {
  return (
    current?.status === statuses.running &&
    current.lease_owner === owner &&
    current.lease_live === true
  );
}

function failureDetail(failure: unknown): string {
  try {
    return JSON.stringify(failure) ?? 'Unknown integration failure';
  } catch {
    return 'Unserializable integration failure';
  }
}

export class IntegrationWorker {
  readonly #db: Database;
  readonly #owner = `integration-worker-ts-${randomUUID()}`;
  readonly #client: Pick<IntegrationClient, 'page'>;
  readonly #settings: ReturnType<typeof integrationSettings>;
  readonly #tokenResolver: typeof freshAccessToken;

  constructor(
    db: Database,
    client: Pick<IntegrationClient, 'page'> = new IntegrationClient(),
    settings: ReturnType<typeof integrationSettings> = integrationSettings(),
    tokenResolver: typeof freshAccessToken = freshAccessToken,
  ) {
    this.#db = db;
    this.#client = client;
    this.#settings = settings;
    this.#tokenResolver = tokenResolver;
  }

  async runOnce(): Promise<boolean> {
    await recoverIntegrationLeases(this.#db);
    const run = await this.#claim();
    if (!run) return false;
    const timer = setInterval(() => {
      void this.#db
        .updateTable('integration_sync_runs')
        .set({
          heartbeat_at: new Date(),
          lease_expires_at: sql<Date>`clock_timestamp() + ${this.#settings.lease_ttl_seconds} * interval '1 second'`,
          updated_at: new Date(),
        })
        .where('id', '=', run.id)
        .where('lease_owner', '=', this.#owner)
        .where('status', '=', statuses.running)
        .where('lease_expires_at', '>', sql<Date>`clock_timestamp()`)
        .execute()
        .catch((error: unknown) =>
          logger.exception('integration_heartbeat_failed', error, { sync_run_id: run.id }),
        );
    }, this.#settings.heartbeat_interval_seconds * 1000);
    try {
      await this.#execute(run);
      await this.#finish(run, null);
    } catch (error) {
      await this.#finish(run, error);
    } finally {
      clearInterval(timer);
    }
    return true;
  }

  async runForever(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        if (await this.runOnce()) continue;
      } catch (error) {
        logger.exception('integration_worker_iteration_failed', error);
      }
      await waitForPoll(this.#settings.poll_interval_seconds * 1000, signal);
    }
  }

  #claim(): Promise<Run | null> {
    return this.#db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('integration_sync_runs')
        .selectAll()
        .where('status', 'in', [statuses.queued, statuses.retry_wait])
        .where('available_at', '<=', sql<Date>`clock_timestamp()`)
        .whereRef('attempt_count', '<', 'max_attempts')
        .orderBy('priority', 'desc')
        .orderBy('available_at', 'asc')
        .orderBy('randomized_position', 'asc')
        .forUpdate()
        .skipLocked()
        .limit(1)
        .executeTakeFirst();
      if (!row) return null;
      const updated = await trx
        .updateTable('integration_sync_runs')
        .set({
          status: statuses.running,
          lease_owner: this.#owner,
          lease_expires_at: sql<Date>`clock_timestamp() + ${this.#settings.lease_ttl_seconds} * interval '1 second'`,
          heartbeat_at: new Date(),
          attempt_count: row.attempt_count + 1,
          updated_at: new Date(),
        })
        .where('id', '=', row.id)
        .where('status', 'in', [statuses.queued, statuses.retry_wait])
        .returningAll()
        .returning([
          sql<string>`window_start::text`.as('window_start'),
          sql<string>`window_end::text`.as('window_end'),
        ])
        .executeTakeFirst();
      if (updated) {
        await trx
          .insertInto('integration_events')
          .values({
            id: randomUUID(),
            workspace_id: updated.workspace_id,
            connection_id: updated.connection_id,
            grant_id: null,
            event_type: 'integration.sync_started',
            message: 'Integration sync started',
            payload: JSON.stringify({ sync_run_id: updated.id }),
            created_at: new Date(),
          })
          .execute();
      }
      return (updated ?? null) as Run | null;
    });
  }

  async runUntilIdle(signal?: AbortSignal) {
    const deadline = performance.now() + queueRecovery.drainBudgetSeconds * 1000;
    let count = 0;
    while (
      count < policy.task_queue.max_drain_batches &&
      !signal?.aborted &&
      performance.now() < deadline
    ) {
      if (!(await this.runOnce())) break;
      count++;
    }
    return count;
  }

  async #execute(run: Run): Promise<void> {
    await this.#db.transaction().execute(async (trx) => {
      await this.#ownedTarget(trx, run);
    });
    const connection = await this.#db
      .selectFrom('integration_connections as connection')
      .innerJoin('integration_oauth_grants as grant', 'grant.id', 'connection.grant_id')
      .select([
        'connection.provider',
        'connection.grant_id',
        'connection.dataset_capabilities',
        'grant.status as grant_status',
      ])
      .where('connection.id', '=', run.connection_id)
      .where('connection.workspace_id', '=', run.workspace_id)
      .where('grant.workspace_id', '=', run.workspace_id)
      .executeTakeFirst();
    if (!connection)
      throw new IntegrationError('unmapped_property', 'Integration connection no longer exists');
    if (connection.grant_status !== 'connected')
      throw new IntegrationError('grant_auth_failed', 'Integration grant needs reconnection');
    const provider = connection.provider as 'gsc' | 'ga4' | 'bing';
    const token = await this.#tokenResolver(this.#db, connection.grant_id, run.workspace_id);
    const artifacts = await this.#db
      .selectFrom('integration_import_artifacts')
      .select(['dataset', 'query_snapshot', 'row_count'])
      .where('sync_run_id', '=', run.id)
      .where('workspace_id', '=', run.workspace_id)
      .execute();
    // Dataset imports share a token and lease; finish each before advancing.
    for (const template of this.#selectedTemplates(provider, connection.dataset_capabilities)) {
      await this.#importDataset(run, provider, token, template, artifacts);
    }
  }

  #selectedTemplates(provider: IntegrationProvider, capabilities: unknown) {
    const selected = selectedItemDataset(capabilities);
    return templates.filter(
      (template) =>
        template.provider === provider &&
        !excluded.has(template.dataset) &&
        (provider !== 'ga4' ||
          !template.dataset.startsWith('ga4_item_') ||
          template.dataset === selected),
    );
  }

  async #importDataset(
    run: Run,
    provider: IntegrationProvider,
    token: string,
    initial: Dataset,
    artifacts: Artifact[],
  ): Promise<void> {
    let template = initial;
    const previousPages = artifacts.filter((item) => item.dataset === template.dataset);
    const offsets = new Set(previousPages.map((item) => artifactOffset(item.query_snapshot)));
    if (provider === 'bing' && offsets.has(0)) return;
    const lastOffset = Math.max(...offsets);
    if (
      previousPages.some(
        (item) =>
          artifactOffset(item.query_snapshot) >= 0 &&
          artifactOffset(item.query_snapshot) === lastOffset &&
          item.row_count < this.#settings.sync_page_size,
      )
    )
      return;
    let offset = offsets.size ? lastOffset + this.#settings.sync_page_size : 0;
    // Commit each offset under the lease before fetching its successor.
    for (let pageNumber = 0; pageNumber < this.#settings.sync_max_pages; pageNumber += 1) {
      if (offsets.has(offset)) {
        offset += this.#settings.sync_page_size;
        continue;
      }
      await this.#db.transaction().execute(async (trx) => {
        await this.#ownedTarget(trx, run);
      });
      const fetched = await this.#fetchPage(
        run,
        provider,
        token,
        template,
        offset,
        offsets.size > 0,
      );
      template = fetched.template;
      await this.#persistPage(run, provider, template, offset, fetched.page);
      offsets.add(offset);
      if (provider === 'bing' || fetched.page.rawRowCount < this.#settings.sync_page_size) return;
      offset += this.#settings.sync_page_size;
      if (pageNumber === this.#settings.sync_max_pages - 1)
        throw new IntegrationError(
          'provider_api_error',
          'Integration paging exceeded its configured bound',
        );
    }
  }

  async #fetchPage(
    run: Run,
    provider: IntegrationProvider,
    token: string,
    template: Dataset,
    offset: number,
    hasPages: boolean,
  ) {
    let page;
    try {
      page = await this.#client.page(
        provider,
        token,
        run.property_ref,
        template,
        valueDate(run.window_start),
        valueDate(run.window_end),
        offset,
      );
    } catch (error) {
      if (
        !(error instanceof IntegrationError) ||
        error.code !== integrationPolicy.contracts.ERROR_GA4_DIMENSION_INCOMPATIBLE ||
        template.dataset !== 'ga4_item_source_medium_daily' ||
        hasPages
      )
        throw error;
      template = await this.#itemFallback(run);
      page = await this.#client.page(
        provider,
        token,
        run.property_ref,
        template,
        valueDate(run.window_start),
        valueDate(run.window_end),
        offset,
      );
    }

    return { page, template };
  }

  async #persistPage(
    run: Run,
    provider: IntegrationProvider,
    template: Dataset,
    offset: number,
    page: ImportPage,
  ): Promise<void> {
    const encoded = JSON.stringify(page.payload);
    if (Buffer.byteLength(encoded, 'utf8') > this.#settings.max_inline_payload_bytes)
      throw new IntegrationError(
        'payload_too_large',
        'Integration page exceeds the configured payload limit',
      );
    const id = randomUUID();
    const payloadHash = createHash('sha256').update(encoded).digest('hex');
    const snapshot = {
      dimensions: template.dimensions,
      metrics: template.metrics,
      date_range: { start: valueDate(run.window_start), end: valueDate(run.window_end) },
      startRow: offset,
    };
    const rows = normalizedRows(
      provider,
      template.dataset,
      template,
      page.payload,
      valueDate(run.window_start),
      valueDate(run.window_end),
    );
    await this.#db.transaction().execute(async (trx) => {
      await this.#ownedTarget(trx, run);
      await trx
        .insertInto('integration_import_artifacts')
        .values({
          id,
          sync_run_id: run.id,
          connection_id: run.connection_id,
          workspace_id: run.workspace_id,
          provider,
          dataset: template.dataset,
          query_snapshot: JSON.stringify(snapshot),
          payload_hash: payloadHash,
          fetched_at: new Date(),
          row_count: page.rawRowCount,
          payload: encoded,
          created_at: new Date(),
        })
        .execute();
      // All derived rows use the same artifact and locked page transaction.
      for (const row of rows) {
        await trx
          .insertInto('integration_metric_rows')
          .values({
            id: randomUUID(),
            workspace_id: run.workspace_id,
            project_id: run.project_id,
            property_ref: run.property_ref,
            provider,
            dataset: template.dataset,
            date: new Date(`${row.date}T00:00:00Z`),
            dimension_key: row.dimension_key,
            metrics: JSON.stringify(row.metrics),
            source_artifact_id: id,
            resync_seq: run.resync_seq,
            importer_version: integrationPolicy.importer_version,
            created_at: new Date(),
          })
          .onConflict((conflict) =>
            conflict
              .columns([
                'project_id',
                'property_ref',
                'provider',
                'dataset',
                'date',
                'dimension_key',
                'resync_seq',
              ])
              .doNothing(),
          )
          .execute();
      }
    });
  }

  async #ownedTarget(db: Database, run: Run) {
    const current = await db
      .selectFrom('integration_sync_runs')
      .select([
        'status',
        'lease_owner',
        sql<boolean>`lease_expires_at > clock_timestamp()`.as('lease_live'),
      ])
      .where('id', '=', run.id)
      .where('workspace_id', '=', run.workspace_id)
      .forUpdate()
      .executeTakeFirst();
    if (!ownsLease(current, this.#owner))
      throw new IntegrationError('provider_api_error', 'Integration sync lease was lost');
    return activeSyncTarget(db, run);
  }

  #itemFallback(run: Run) {
    return this.#db.transaction().execute(async (trx) => {
      const connection = await this.#ownedTarget(trx, run);
      const template = templates.find((item) => item.dataset === 'ga4_item_channel_group_daily');
      if (!template) throw new Error('GA4 item fallback policy is missing');
      const capabilities =
        typeof connection.dataset_capabilities === 'object' &&
        connection.dataset_capabilities !== null
          ? connection.dataset_capabilities
          : {};
      await trx
        .updateTable('integration_connections')
        .set({
          dataset_capabilities: JSON.stringify({
            ...capabilities,
            [integrationPolicy.ga4_capability_key]: {
              selected_dataset: template.dataset,
              source_granularity: integrationPolicy.ga4_fallback_granularity,
              reason: integrationPolicy.contracts.ERROR_GA4_DIMENSION_INCOMPATIBLE,
              version: integrationPolicy.ga4_capability_version,
            },
          }),
          updated_at: new Date(),
        })
        .where('id', '=', run.connection_id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      return template;
    });
  }

  async #finish(run: Run, failure: unknown): Promise<void> {
    const now = new Date();
    await this.#db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('integration_sync_runs')
        .select([
          'status',
          'lease_owner',
          sql<boolean>`lease_expires_at > clock_timestamp()`.as('lease_live'),
        ])
        .where('id', '=', run.id)
        .where('workspace_id', '=', run.workspace_id)
        .forUpdate()
        .executeTakeFirst();
      if (!ownsLease(current, this.#owner)) return;
      if (failure === null) {
        try {
          await this.#ownedTarget(trx, run);
        } catch (error) {
          failure = error;
        }
      }
      if (failure === null) await this.#succeed(trx, run, now);
      else await this.#fail(trx, run, now, failure);
    });
  }

  async #succeed(trx: Database, run: Run, now: Date): Promise<void> {
    await trx
      .updateTable('integration_sync_runs')
      .set({
        status: statuses.succeeded,
        completed_at: now,
        lease_owner: null,
        lease_expires_at: null,
        updated_at: now,
        error_code: '',
        error_detail: '',
      })
      .where('id', '=', run.id)
      .execute();
    await trx
      .updateTable('integration_connections')
      .set({ last_synced_at: now, updated_at: now })
      .where('id', '=', run.connection_id)
      .where('workspace_id', '=', run.workspace_id)
      .execute();
    await trx
      .insertInto('integration_events')
      .values({
        id: randomUUID(),
        workspace_id: run.workspace_id,
        connection_id: run.connection_id,
        grant_id: null,
        event_type: 'integration.sync_finished',
        message: 'Integration sync completed',
        payload: JSON.stringify({ sync_run_id: run.id }),
        created_at: now,
      })
      .execute();
    await enqueuePostSyncProjections(trx, run);
  }

  async #fail(trx: Database, run: Run, now: Date, failure: unknown): Promise<void> {
    const error = failure instanceof Error ? failure : new Error(failureDetail(failure));
    const retryable = failure instanceof IntegrationError && failure.retryable;
    const retry = retryable && run.attempt_count < run.max_attempts;
    const retryDelay = this.#retryDelay(run, failure);
    await trx
      .updateTable('integration_sync_runs')
      .set({
        status: retry ? statuses.retry_wait : statuses.failed,
        available_at: retry ? new Date(now.getTime() + retryDelay * 1000) : now,
        completed_at: retry ? null : now,
        lease_owner: null,
        lease_expires_at: null,
        updated_at: now,
        error_code: failure instanceof IntegrationError ? failure.code : 'provider_api_error',
        error_detail: error.message.slice(0, 512),
      })
      .where('id', '=', run.id)
      .execute();
    if (failure instanceof IntegrationError && failure.code === 'grant_auth_failed') {
      await trx
        .updateTable('integration_oauth_grants')
        .set({ status: 'needs_reauth', updated_at: now })
        .where(
          'id',
          '=',
          (
            await trx
              .selectFrom('integration_connections')
              .select('grant_id')
              .where('id', '=', run.connection_id)
              .where('workspace_id', '=', run.workspace_id)
              .executeTakeFirstOrThrow()
          ).grant_id,
        )
        .where('workspace_id', '=', run.workspace_id)
        .execute();
    }
    await trx
      .insertInto('integration_events')
      .values({
        id: randomUUID(),
        workspace_id: run.workspace_id,
        connection_id: run.connection_id,
        grant_id: null,
        event_type:
          failure instanceof IntegrationError && failure.code === 'grant_auth_failed'
            ? 'integration.reauth_required'
            : 'integration.sync_finished',
        message: retry ? 'Integration sync will retry' : 'Integration sync failed',
        payload: JSON.stringify({
          sync_run_id: run.id,
          error_code: failure instanceof IntegrationError ? failure.code : 'provider_api_error',
          retry,
        }),
        created_at: now,
      })
      .execute();
    logger.warning('integration_sync_failed', {
      sync_run_id: run.id,
      error_code: failure instanceof IntegrationError ? failure.code : 'provider_api_error',
      retry,
    });
  }

  #retryDelay(run: Run, failure: unknown): number {
    if (failure instanceof IntegrationError && failure.retryAfter !== null)
      return Math.min(failure.retryAfter, this.#settings.retry_max_delay_seconds);
    return Math.min(
      this.#settings.retry_base_delay_seconds * 2 ** Math.max(0, run.attempt_count - 1),
      this.#settings.retry_max_delay_seconds,
    );
  }
}
