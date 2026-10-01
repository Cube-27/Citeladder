import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import { jsonObjects, record, strings } from '../db/json.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import type {
  SearchIntelligenceRuns,
  SearchIntelligenceCalls,
  SearchIntelligenceDatasets,
} from '../generated/db-schema.ts';
import { si } from './requests.ts';
import { normalizeResponse } from './normalization.ts';
import type { ResearchResponse } from './live.ts';
import { ProviderError } from '../answer-engines/contracts.ts';

type Run = Selectable<SearchIntelligenceRuns>;
type Call = Selectable<SearchIntelligenceCalls>;
type Dataset = Selectable<SearchIntelligenceDatasets>;
export type ResearchPlan = Record<string, unknown>;
export type PreparedResearch =
  | { action: 'stop' | 'skip' }
  | {
      action: 'dispatch' | 'publish';
      run: Run;
      call: Call;
      dataset: Dataset;
      ordinal: number;
      secret: string;
      baseUrl: string;
    };
const terminal = ['succeeded', 'failed', 'partial', 'cancelled', 'uncertain'];
const money = (value: unknown) => Math.round(Number(value ?? 0) * 1e8);
const amount = (value: number) => (value / 1e8).toFixed(8);

/** Root run lock precedes queue/call locks, matching cancellation's lock order. */
export class AcquisitionState {
  readonly db: Database;
  readonly task: QueueTask;
  readonly runId: string;
  constructor(db: Database, task: QueueTask, runId: string) {
    this.db = db;
    this.task = task;
    this.runId = runId;
  }
  run(db = this.db) {
    return db
      .selectFrom('search_intelligence_runs')
      .selectAll()
      .where('workspace_id', '=', this.task.workspace_id)
      .where('project_id', '=', this.task.project_id!)
      .where('id', '=', this.runId);
  }
  calls(db = this.db) {
    return db
      .selectFrom('search_intelligence_calls')
      .selectAll()
      .where('workspace_id', '=', this.task.workspace_id)
      .where('project_id', '=', this.task.project_id!)
      .where('run_id', '=', this.runId);
  }
  async owned(db: Database, at: Date) {
    return db
      .selectFrom('analytics_tasks')
      .select('id')
      .where('workspace_id', '=', this.task.workspace_id)
      .where('project_id', '=', this.task.project_id)
      .where('id', '=', this.task.id)
      .where('lease_owner', '=', this.task.lease_owner)
      .where('status', '=', 'running')
      .where('lease_expires_at', '>', at)
      .forUpdate()
      .executeTakeFirst();
  }
  async connection(db: Database, run: Run) {
    const member = await db
      .selectFrom('workspace_members')
      .select('id')
      .where('workspace_id', '=', run.workspace_id)
      .where('user_id', '=', run.actor_user_id)
      .where('role', '!=', 'viewer')
      .executeTakeFirst();
    if (!member) return undefined;
    return db
      .selectFrom('provider_connections')
      .selectAll()
      .where('workspace_id', '=', run.workspace_id)
      .where('id', '=', run.connection_id)
      .where('transport_provider', '=', 'dataforseo')
      .where('active', '=', true)
      .where('credential_revision', '=', run.connection_revision)
      .executeTakeFirst();
  }
  async start(at = new Date()) {
    return this.db.transaction().execute(async (trx) => {
      const run = await this.run(trx).forUpdate().executeTakeFirst();
      if (!run || terminal.includes(run.status) || !(await this.owned(trx, at))) return null;
      if (
        !run.confirmed_at ||
        run.pricing_version !== si.price_version ||
        !(await this.connection(trx, run))
      ) {
        await trx
          .updateTable('search_intelligence_runs')
          .set({
            status: 'failed',
            error_code:
              run.pricing_version !== si.price_version ? 'pricing_changed' : 'connection_changed',
            completed_at: at,
            updated_at: at,
          })
          .where('id', '=', run.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        return null;
      }
      await trx
        .updateTable('search_intelligence_runs')
        .set({ status: 'running', updated_at: at })
        .where('id', '=', run.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      return jsonObjects(run.call_plan, 'Search Intelligence plan');
    });
  }
  async prepare(plan: ResearchPlan, sequence: number, at = new Date()): Promise<PreparedResearch> {
    return this.db.transaction().execute(async (trx) => {
      const run = await this.run(trx).forUpdate().executeTakeFirst();
      if (!run || run.status !== 'running' || !(await this.owned(trx, at)))
        return { action: 'stop' };
      const connection = await this.connection(trx, run);
      if (!connection) {
        await trx
          .updateTable('search_intelligence_runs')
          .set({
            status: run.completed_calls ? 'partial' : 'failed',
            error_code: 'connection_changed',
            completed_at: at,
            updated_at: at,
          })
          .where('id', '=', run.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        return { action: 'stop' };
      }
      const target = record(plan.target),
        comparison = record(plan.comparison),
        request = record(plan.request),
        kind = String(plan.dataset_kind);
      let dataset = await trx
        .selectFrom('search_intelligence_datasets')
        .selectAll()
        .where('workspace_id', '=', run.workspace_id)
        .where('project_id', '=', run.project_id)
        .where('run_id', '=', run.id)
        .where('scope_hash', '=', String(plan.scope_hash))
        .forUpdate()
        .executeTakeFirst();
      if (!dataset)
        dataset = await trx
          .insertInto('search_intelligence_datasets')
          .values({
            id: randomUUID(),
            workspace_id: run.workspace_id,
            project_id: run.project_id,
            run_id: run.id,
            dataset_kind: kind,
            scope_hash: String(plan.scope_hash),
            target_domain: String(target.registrable_domain),
            target_hostname: String(target.hostname),
            target_origin: String(target.origin),
            comparison_origin: String(comparison.origin ?? ''),
            location_code: si.backlink_kinds.includes(kind) ? null : Number(request.location_code),
            language_code: si.backlink_kinds.includes(kind)
              ? ''
              : String(request.language_code ?? ''),
            requested_rows: Number(plan.requested_rows),
            provider_filters: JSON.stringify({
              ...request,
              research_scope: plan.research_scope ?? 'exact_host',
            }),
            collection_started_at: at,
            collection_ended_at: null,
            published_at: null,
            parent_dataset_id: null,
            parser_version: si.parser_version,
            status: 'collecting',
            coverage: 'unknown',
            created_at: at,
            provider_total: null,
            raw_rows_received: 0,
            unique_rows_saved: 0,
            truncated: false,
            summary: JSON.stringify({}),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      if (['published', 'failed'].includes(dataset.status)) return { action: 'skip' };
      const requestKey = `${plan.dataset_key}:${plan.page}`;
      let call = await this.calls(trx)
        .where('request_key', '=', requestKey)
        .forUpdate()
        .executeTakeFirst();
      if (!call)
        call = await trx
          .insertInto('search_intelligence_calls')
          .values({
            id: randomUUID(),
            workspace_id: run.workspace_id,
            project_id: run.project_id,
            run_id: run.id,
            dataset_id: dataset.id,
            request_key: requestKey,
            sequence,
            endpoint: String(plan.endpoint),
            sanitized_request: JSON.stringify(request),
            estimated_cost_usd: String(plan.estimated_cost_usd),
            status: 'intent',
            created_at: at,
            completed_at: null,
            dispatched_at: null,
            error_code: '',
            error_detail: '',
            provider_reported_cost_usd: null,
            provider_task_id: '',
            response_sha256: '',
            sanitized_response: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      if (['succeeded', 'failed', 'uncertain'].includes(call.status)) return { action: 'skip' };
      const latest = await trx
        .selectFrom('search_intelligence_dispatch_attempts')
        .selectAll()
        .where('workspace_id', '=', run.workspace_id)
        .where('project_id', '=', run.project_id)
        .where('call_id', '=', call.id)
        .where('phase', '=', 'dispatch')
        .orderBy('ordinal', 'desc')
        .executeTakeFirst();
      if (call.status === 'dispatched' && call.sanitized_response === null) {
        if (latest)
          await this.outcome(
            trx,
            call,
            latest.ordinal,
            latest.dispatched_at,
            'uncertain',
            null,
            at,
          );
        await trx
          .updateTable('search_intelligence_calls')
          .set({ status: 'uncertain', completed_at: at, error_code: 'provider_result_missing' })
          .where('id', '=', call.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        await trx
          .updateTable('search_intelligence_runs')
          .set({
            status: 'uncertain',
            uncertain_calls: run.uncertain_calls + 1,
            completed_at: at,
            updated_at: at,
          })
          .where('id', '=', run.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        return { action: 'stop' };
      }
      return {
        action: call.status === 'dispatched' ? 'publish' : 'dispatch',
        run,
        call,
        dataset,
        ordinal: (latest?.ordinal ?? 0) + 1,
        secret: connection.api_key_encrypted,
        baseUrl: connection.base_url,
      };
    });
  }
  async outcome(
    db: Database,
    call: Call,
    ordinal: number,
    dispatched: Date,
    status: string,
    error: ProviderError | null,
    at: Date,
  ) {
    const prior = await db
      .selectFrom('search_intelligence_dispatch_attempts')
      .select('id')
      .where('workspace_id', '=', call.workspace_id)
      .where('project_id', '=', call.project_id)
      .where('call_id', '=', call.id)
      .where('ordinal', '=', ordinal)
      .where('phase', '=', 'outcome')
      .executeTakeFirst();
    if (!prior)
      await db
        .insertInto('search_intelligence_dispatch_attempts')
        .values({
          id: randomUUID(),
          workspace_id: call.workspace_id,
          project_id: call.project_id,
          call_id: call.id,
          ordinal,
          phase: 'outcome',
          status,
          error_code: error?.code ?? '',
          retry_after_seconds: error?.retryAfterSeconds ?? null,
          dispatched_at: dispatched,
          completed_at: at,
        })
        .execute();
  }
  async dispatch(
    prepared: Extract<PreparedResearch, { action: 'dispatch' | 'publish' }>,
    at = new Date(),
  ) {
    return this.db.transaction().execute(async (trx) => {
      const run = await this.run(trx).forUpdate().executeTakeFirst();
      if (
        !run ||
        run.status !== 'running' ||
        !(await this.owned(trx, at)) ||
        !(await this.connection(trx, run))
      )
        return false;
      const call = await this.calls(trx)
        .where('id', '=', prepared.call.id)
        .where('status', '=', 'intent')
        .forUpdate()
        .executeTakeFirst();
      if (!call) return false;
      await trx
        .updateTable('search_intelligence_calls')
        .set({ status: 'dispatched', dispatched_at: at })
        .where('id', '=', call.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      await trx
        .insertInto('search_intelligence_dispatch_attempts')
        .values({
          id: randomUUID(),
          workspace_id: run.workspace_id,
          project_id: run.project_id,
          call_id: call.id,
          ordinal: prepared.ordinal,
          phase: 'dispatch',
          status: 'dispatched',
          error_code: '',
          retry_after_seconds: null,
          dispatched_at: at,
          completed_at: null,
        })
        .execute();
      return true;
    });
  }
  /** Raw paid response survives a lost queue lease; projection recovery uses this exact receipt. */
  async saveResponse(callId: string, response: ResearchResponse, at = new Date()) {
    return this.db.transaction().execute(async (trx) => {
      const run = await this.run(trx).forUpdate().executeTakeFirst();
      if (!run) return;
      const call = await this.calls(trx)
        .where('id', '=', callId)
        .where('status', '=', 'dispatched')
        .forUpdate()
        .executeTakeFirst();
      if (!call || call.sanitized_response !== null) return;
      await trx
        .updateTable('search_intelligence_calls')
        .set({
          sanitized_response: JSON.stringify(response.body),
          response_sha256: response.hash,
          provider_task_id: response.taskId,
          provider_reported_cost_usd: response.cost,
        })
        .where('id', '=', call.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      const latest = await trx
        .selectFrom('search_intelligence_dispatch_attempts')
        .selectAll()
        .where('workspace_id', '=', run.workspace_id)
        .where('project_id', '=', run.project_id)
        .where('call_id', '=', call.id)
        .where('phase', '=', 'dispatch')
        .orderBy('ordinal', 'desc')
        .executeTakeFirst();
      if (latest)
        await this.outcome(trx, call, latest.ordinal, latest.dispatched_at, 'succeeded', null, at);
      if (run.status === 'cancelled') {
        const costs = await this.calls(trx).select('provider_reported_cost_usd').execute();
        await trx
          .updateTable('search_intelligence_runs')
          .set({
            provider_reported_cost_usd: amount(
              costs.reduce((sum, item) => sum + money(item.provider_reported_cost_usd), 0),
            ),
            updated_at: at,
          })
          .where('id', '=', run.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
      }
    });
  }
  async park(at: Date) {
    return this.db.transaction().execute(async (trx) => {
      const run = await this.run(trx).forUpdate().executeTakeFirst();
      if (!run || run.status !== 'running' || !(await this.owned(trx, new Date()))) return;
      await trx
        .updateTable('search_intelligence_runs')
        .set({ status: 'queued', updated_at: new Date() })
        .where('id', '=', run.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      await trx
        .updateTable('analytics_tasks')
        .set({
          status: 'retry_wait',
          available_at: at,
          lease_owner: null,
          lease_expires_at: null,
          updated_at: new Date(),
        })
        .where('id', '=', this.task.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
    });
  }
  async publish(plan: ResearchPlan, callId: string, later: ResearchPlan[], at = new Date()) {
    return this.db.transaction().execute(async (trx) => {
      const run = await this.run(trx).forUpdate().executeTakeFirst();
      if (!run || run.status !== 'running' || !(await this.owned(trx, at))) return true;
      const call = await this.calls(trx)
        .where('id', '=', callId)
        .where('status', '=', 'dispatched')
        .forUpdate()
        .executeTakeFirst();
      if (!call || !call.sanitized_response) return true;
      const dataset = await trx
        .selectFrom('search_intelligence_datasets')
        .selectAll()
        .where('workspace_id', '=', run.workspace_id)
        .where('project_id', '=', run.project_id)
        .where('id', '=', call.dataset_id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const totalCost =
        money(run.provider_reported_cost_usd) + money(call.provider_reported_cost_usd);
      const missingCost = call.provider_reported_cost_usd === null,
        over = totalCost > money(run.estimated_cost_usd);
      const stopped = missingCost || over;
      const update = {
        provider_reported_cost_usd: missingCost
          ? run.provider_reported_cost_usd
          : amount(totalCost),
        uncertain_calls: run.uncertain_calls + (missingCost ? 1 : 0),
        status: missingCost ? 'uncertain' : over ? 'partial' : 'running',
        error_code: missingCost
          ? 'provider_cost_unavailable'
          : over
            ? 'cost_ceiling_exceeded'
            : run.error_code,
        completed_at: stopped ? at : null,
        updated_at: at,
      };
      await trx
        .updateTable('search_intelligence_calls')
        .set({ status: 'succeeded', completed_at: at })
        .where('id', '=', call.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      let normalized: ReturnType<typeof normalizeResponse>;
      try {
        normalized = normalizeResponse(dataset.dataset_kind, record(call.sanitized_response), plan);
      } catch {
        await trx
          .updateTable('search_intelligence_calls')
          .set({
            status: 'failed',
            error_code: 'provider_scope_violation',
            error_detail: 'Provider results escaped the reviewed scope',
          })
          .where('id', '=', call.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        await trx
          .updateTable('search_intelligence_datasets')
          .set({ status: 'failed', coverage: 'unknown', collection_ended_at: at })
          .where('id', '=', dataset.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        await trx
          .updateTable('search_intelligence_runs')
          .set({
            ...update,
            status: missingCost ? 'uncertain' : 'partial',
            error_code: 'provider_scope_violation',
            completed_at: at,
          })
          .where('id', '=', run.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        return true;
      }
      for (const row of normalized.rows)
        await trx
          .insertInto('search_intelligence_rows')
          .values({
            ...row,
            auxiliary: JSON.stringify(row.auxiliary),
            id: randomUUID(),
            workspace_id: run.workspace_id,
            project_id: run.project_id,
            dataset_id: dataset.id,
            call_id: call.id,
            row_kind: dataset.dataset_kind,
            created_at: at,
          })
          .onConflict((oc) => oc.columns(['dataset_id', 'provider_row_key']).doNothing())
          .execute();
      const count = await trx
        .selectFrom('search_intelligence_rows')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('workspace_id', '=', run.workspace_id)
        .where('project_id', '=', run.project_id)
        .where('dataset_id', '=', dataset.id)
        .executeTakeFirstOrThrow();
      const received = dataset.raw_rows_received + normalized.received,
        exhausted = normalized.received < Number(record(plan.request).limit ?? 1),
        finished = !later.some((item) => item.dataset_key === plan.dataset_key) || exhausted;
      const coverage = !normalized.summary.result_available
        ? 'unknown'
        : received === 0
          ? 'empty'
          : ['footprint', 'backlink_summary', 'backlink_history'].includes(dataset.dataset_kind) ||
              exhausted ||
              count.count >= dataset.requested_rows
            ? 'complete'
            : 'partial';
      const total = normalized.total ?? dataset.provider_total;
      await trx
        .updateTable('search_intelligence_datasets')
        .set({
          raw_rows_received: received,
          unique_rows_saved: count.count,
          provider_total: total,
          summary: JSON.stringify({
            ...record(dataset.summary),
            ...normalized.summary,
            source_call_ids: [...strings(record(dataset.summary).source_call_ids), call.id],
          }),
          ...(finished
            ? {
                status: 'published',
                coverage,
                truncated:
                  coverage === 'partial' ||
                  (!['footprint', 'backlink_summary'].includes(dataset.dataset_kind) &&
                    total !== null &&
                    total > count.count),
                collection_ended_at: at,
                published_at: at,
              }
            : {}),
        })
        .where('id', '=', dataset.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      await trx
        .updateTable('search_intelligence_runs')
        .set({
          ...update,
          completed_calls: run.completed_calls + 1,
          received_rows: run.received_rows + normalized.rows.length,
        })
        .where('id', '=', run.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      return stopped;
    });
  }
  async fail(
    prepared: Extract<PreparedResearch, { action: 'dispatch' | 'publish' }>,
    error: ProviderError,
    at = new Date(),
  ) {
    return this.db.transaction().execute(async (trx) => {
      const run = await this.run(trx).forUpdate().executeTakeFirst();
      if (!run || run.status !== 'running' || !(await this.owned(trx, at)))
        return { stop: true, wait: null };
      const call = await this.calls(trx)
        .where('id', '=', prepared.call.id)
        .where('status', '=', 'dispatched')
        .forUpdate()
        .executeTakeFirst();
      if (!call) return { stop: true, wait: null };
      const uncertain = ['connection', 'timeout'].includes(error.code),
        retry = error.code === 'rate_limit' && prepared.ordinal <= si.rate_limit_retries;
      await this.outcome(
        trx,
        call,
        prepared.ordinal,
        call.dispatched_at!,
        uncertain ? 'uncertain' : error.code === 'rate_limit' ? 'rate_limited' : 'failed',
        error,
        at,
      );
      await trx
        .updateTable('search_intelligence_calls')
        .set({
          status: retry ? 'intent' : uncertain ? 'uncertain' : 'failed',
          dispatched_at: retry ? null : call.dispatched_at,
          completed_at: retry ? null : at,
          error_code: error.code,
          error_detail: error.message,
        })
        .where('id', '=', call.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      if (!retry)
        await trx
          .updateTable('search_intelligence_datasets')
          .set({ status: 'failed', coverage: 'unknown', collection_ended_at: at })
          .where('id', '=', call.dataset_id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
      if (uncertain)
        await trx
          .updateTable('search_intelligence_runs')
          .set({
            status: 'uncertain',
            uncertain_calls: run.uncertain_calls + 1,
            completed_at: at,
            updated_at: at,
          })
          .where('id', '=', run.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
      return {
        stop: uncertain,
        wait: retry
          ? new Date(
              at.getTime() +
                Math.min(
                  si.rate_limit_max_wait_seconds,
                  Math.max(0, error.retryAfterSeconds ?? si.rate_limit_default_wait_seconds),
                ) *
                  1000,
            )
          : null,
      };
    });
  }
  async finish(at = new Date()) {
    return this.db.transaction().execute(async (trx) => {
      const run = await this.run(trx).forUpdate().executeTakeFirst();
      if (!run || run.status !== 'running' || !(await this.owned(trx, at))) return;
      const datasets = await trx
        .selectFrom('search_intelligence_datasets')
        .select(['status', 'coverage'])
        .where('workspace_id', '=', run.workspace_id)
        .where('project_id', '=', run.project_id)
        .where('run_id', '=', run.id)
        .execute();
      const failed = datasets.some(
        (item) => item.status === 'failed' || item.coverage === 'unknown',
      );
      await trx
        .updateTable('search_intelligence_runs')
        .set({ status: failed ? 'partial' : 'succeeded', completed_at: at, updated_at: at })
        .where('id', '=', run.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
    });
  }
}
