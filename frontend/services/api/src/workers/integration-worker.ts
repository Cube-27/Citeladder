import { createHash, randomUUID } from 'node:crypto';

import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { IntegrationClient, IntegrationError, providerNumber } from '../integrations/client.ts';
import { integrationPolicy, integrationSettings } from '../integrations/config.ts';
import { freshAccessToken } from '../integrations/tokens.ts';
import { enqueueTask } from '../referrals/enqueue.ts';

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
  window_start: Date;
  window_end: Date;
  resync_seq: number;
  attempt_count: number;
  max_attempts: number;
};

function valueDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function isoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (/^\d{8}$/u.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return /^\d{4}-\d{2}-\d{2}$/u.test(raw) ? raw : null;
}
function values(row: Record<string, unknown>): unknown[] {
  return Array.isArray(row.keys) ? row.keys : [];
}
function normalizedRows(
  provider: string,
  dataset: string,
  template: (typeof templates)[number],
  payload: Record<string, unknown>,
) {
  const source = Array.isArray(payload.rows) ? payload.rows : [];
  return source.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    let row = item as Record<string, unknown>;
    if (provider === 'ga4') {
      const dimensions = Array.isArray(row.dimensionValues) ? row.dimensionValues : [];
      const metrics = Array.isArray(row.metricValues) ? row.metricValues : [];
      if (
        dimensions.length !== template.dimensions.length ||
        metrics.length !== template.metrics.length
      )
        return [];
      const keys = dimensions.map((value) =>
        value !== null && typeof value === 'object' && 'value' in value ? value.value : null,
      );
      const numeric = metrics.map((value) =>
        value !== null && typeof value === 'object' && 'value' in value
          ? providerNumber(value.value)
          : null,
      );
      if (
        keys.some((value) => typeof value !== 'string') ||
        numeric.some((value) => value === null)
      )
        return [];
      row = {
        keys,
        ...Object.fromEntries(template.metrics.map((name, index) => [name, numeric[index]])),
      };
    }
    const keys = values(row);
    if (keys.length !== template.dimensions.length || keys.some((key) => typeof key !== 'string'))
      return [];
    const dateIndex = template.dimensions.findIndex(
      (dimension) => dimension.toLowerCase() === 'date',
    );
    if (dateIndex < 0) return [];
    const date = isoDate(keys[dateIndex]);
    if (date === null) return [];
    const metrics = Object.fromEntries(
      template.metrics.flatMap((name) => {
        const metric = row[name];
        return typeof metric === 'number' && Number.isFinite(metric) ? [[name, metric]] : [];
      }),
    );
    if (Object.keys(metrics).length !== template.metrics.length) return [];
    const dimensionKey = keys
      .filter((_key, index) => index !== dateIndex)
      .join(integrationPolicy.dimension_separator);
    return [{ provider, dataset, date, dimension_key: dimensionKey, metrics }];
  });
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
    const run = await this.#claim();
    if (!run) return false;
    const timer = setInterval(() => {
      void this.#db
        .updateTable('integration_sync_runs')
        .set({
          heartbeat_at: new Date(),
          lease_expires_at: new Date(Date.now() + this.#settings.lease_ttl_seconds * 1000),
          updated_at: new Date(),
        })
        .where('id', '=', run.id)
        .where('lease_owner', '=', this.#owner)
        .where('status', '=', statuses.running)
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
      if (await this.runOnce()) continue;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.#settings.poll_interval_seconds * 1000);
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

  async #claim(): Promise<Run | null> {
    return this.#db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('integration_sync_runs')
        .selectAll()
        .where('status', 'in', [statuses.queued, statuses.retry_wait])
        .where('available_at', '<=', new Date())
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
          lease_expires_at: new Date(Date.now() + this.#settings.lease_ttl_seconds * 1000),
          heartbeat_at: new Date(),
          attempt_count: row.attempt_count + 1,
          updated_at: new Date(),
        })
        .where('id', '=', row.id)
        .where('status', 'in', [statuses.queued, statuses.retry_wait])
        .returningAll()
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

  async #execute(run: Run): Promise<void> {
    const connection = await this.#db
      .selectFrom('integration_connections as connection')
      .innerJoin('integration_oauth_grants as grant', 'grant.id', 'connection.grant_id')
      .select(['connection.provider', 'connection.grant_id', 'grant.status as grant_status'])
      .where('connection.id', '=', run.connection_id)
      .where('connection.workspace_id', '=', run.workspace_id)
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
    for (const template of templates) {
      if (template.provider !== provider || excluded.has(template.dataset)) continue;
      const offsets = new Set(
        artifacts
          .filter((item) => item.dataset === template.dataset)
          .map((item) => {
            const snapshot = item.query_snapshot as Record<string, unknown> | null;
            return typeof snapshot?.page_offset === 'number' ? snapshot.page_offset : -1;
          }),
      );
      const previousPages = artifacts.filter((item) => item.dataset === template.dataset);
      if (provider === 'bing' && offsets.has(0)) continue;
      if (
        previousPages.some((item) => {
          const snapshot = item.query_snapshot as Record<string, unknown> | null;
          return (
            typeof snapshot?.page_offset === 'number' &&
            snapshot.page_offset === Math.max(...offsets) &&
            item.row_count < this.#settings.sync_page_size
          );
        })
      )
        continue;
      let offset = offsets.size ? Math.max(...offsets) + this.#settings.sync_page_size : 0;
      for (let pageNumber = 0; pageNumber < this.#settings.sync_max_pages; pageNumber += 1) {
        if (offsets.has(offset)) {
          offset += this.#settings.sync_page_size;
          continue;
        }
        const page = await this.#client.page(
          provider,
          token,
          run.property_ref,
          template,
          valueDate(run.window_start),
          valueDate(run.window_end),
          offset,
        );
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
          page_offset: offset,
        };
        const rows = normalizedRows(provider, template.dataset, template, page.payload);
        await this.#db.transaction().execute(async (trx) => {
          const current = await trx
            .selectFrom('integration_sync_runs')
            .select(['status', 'lease_owner'])
            .where('id', '=', run.id)
            .where('workspace_id', '=', run.workspace_id)
            .forUpdate()
            .executeTakeFirst();
          if (
            !current ||
            current.status !== statuses.running ||
            current.lease_owner !== this.#owner
          ) {
            throw new IntegrationError('provider_api_error', 'Integration sync lease was lost');
          }
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
        offsets.add(offset);
        if (provider === 'bing' || page.rawRowCount < this.#settings.sync_page_size) break;
        offset += this.#settings.sync_page_size;
        if (pageNumber === this.#settings.sync_max_pages - 1)
          throw new IntegrationError(
            'provider_api_error',
            'Integration paging exceeded its configured bound',
          );
      }
    }
  }

  async #finish(run: Run, failure: unknown): Promise<void> {
    const now = new Date();
    await this.#db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('integration_sync_runs')
        .select(['status', 'lease_owner'])
        .where('id', '=', run.id)
        .where('workspace_id', '=', run.workspace_id)
        .forUpdate()
        .executeTakeFirst();
      if (!current || current.status !== statuses.running || current.lease_owner !== this.#owner)
        return;
      if (failure === null) {
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
        const artifacts = await trx
          .selectFrom('integration_import_artifacts')
          .select(['id', 'dataset'])
          .where('sync_run_id', '=', run.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        const maxAttempts = resolveSettingSpec(
          policy.analytics.worker_settings.task_max_attempts,
        ) as number;
        const referralDatasets = new Set(policy.traffic.TRAFFIC_GA4_REFERRAL_DATASETS);
        const trafficDatasets = new Set(policy.traffic.TRAFFIC_REFRESH_TRIGGER_DATASETS);
        for (const artifact of artifacts) {
          if (!referralDatasets.has(artifact.dataset)) continue;
          await enqueueTask(trx, {
            workspaceId: run.workspace_id,
            projectId: run.project_id,
            kind: 'ingest_referrals',
            payload: { import_artifact_id: artifact.id },
            keyParts: [run.project_id, artifact.id],
            maxAttempts,
          });
        }
        if (artifacts.some((artifact) => trafficDatasets.has(artifact.dataset))) {
          const start = valueDate(run.window_start);
          const end = valueDate(run.window_end);
          const sourceRevision = run.id;
          await enqueueTask(trx, {
            workspaceId: run.workspace_id,
            projectId: run.project_id,
            kind: 'traffic_snapshot_refresh',
            payload: { window_start: start, window_end: end, source_revision: sourceRevision },
            keyParts: [run.project_id, start, end, run.resync_seq, sourceRevision],
            maxAttempts,
          });
        }
        return;
      }
      const error = failure instanceof Error ? failure : new Error(String(failure));
      const retryable = failure instanceof IntegrationError && failure.retryable;
      const retry = retryable && run.attempt_count < run.max_attempts;
      const retryDelay =
        failure instanceof IntegrationError && failure.retryAfter !== null
          ? Math.min(failure.retryAfter, this.#settings.retry_max_delay_seconds)
          : Math.min(
              this.#settings.retry_base_delay_seconds * 2 ** Math.max(0, run.attempt_count - 1),
              this.#settings.retry_max_delay_seconds,
            );
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
    });
  }
}
