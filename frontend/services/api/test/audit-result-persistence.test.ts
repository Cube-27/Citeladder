import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { asOwner, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { auditTenant, auditTestKey } from './audit-fixtures.ts';
import { billingAccount } from './prompt-fixtures.ts';
import { createAudits } from '../src/audits/creation.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { auditRuntime } from '../src/audits/config.ts';
import { AuditQueue } from '../src/queue/audit-queue.ts';
import { loadExecutionContext } from '../src/audits/execution-context.ts';
import {
  persistExecutionSuccess,
  persistAnswerFailure,
  type ExecutionResult,
} from '../src/audits/result-persistence.ts';
import { ProviderError } from '../src/providers/errors.ts';
import { record } from '../src/db/json.ts';
import { deriveExecution } from '../src/audits/derivation.ts';
import { finalizeAudit } from '../src/audits/finalization.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db),
  runtime = auditRuntime({});
const queue = new AuditQueue(db, 120),
  tasks: string[] = [],
  workspaces: string[] = [];
afterEach(async () => {
  if (tasks.length) {
    await db.deleteFrom('execution_cost_projections').where('task_id', 'in', tasks).execute();
    await asOwner((owner) =>
      owner.deleteFrom('provider_attempts').where('task_id', 'in', tasks).execute(),
    );
  }
  if (workspaces.length)
    await asOwner((owner) =>
      owner.deleteFrom('consumable_ledger').where('workspace_id', 'in', workspaces).execute(),
    );
  await fixtures.cleanup();
  tasks.length = 0;
  workspaces.length = 0;
});
afterAll(async () => {
  await db.destroy();
});
async function seed(funded = false) {
  const t = await auditTenant(db, fixtures);
  workspaces.push(t.workspaceId);
  const [auditId] = await createAudits(
    db,
    t.workspaceId,
    auditInput.parse({ project_id: t.projectId, prompt_set_id: t.setId, engines: ['chatgpt'] }),
    {},
    runtime,
  );
  const [claimed] = await queue.claim('worker', 1, { workspaceId: t.workspaceId, auditId });
  const owner = claimed!.lease_owner;
  const running = await queue.markRunning(claimed!, owner);
  const context = await loadExecutionContext(db, running!.task, owner, runtime, auditTestKey, {
    at: new Date(),
    env: {},
  });
  tasks.push(context!.task.id);
  let accountId = '';
  if (funded) {
    accountId = await billingAccount(db, t.workspaceId);
    const { reservation_id: reservationId } = await db
      .selectFrom('consumable_ledger')
      .select('reservation_id')
      .where('subject_id', '=', context!.task.id)
      .where('entry_kind', '=', 'reservation')
      .executeTakeFirstOrThrow();
    await db
      .updateTable('audit_tasks')
      .set({
        provider_route_snapshot: JSON.stringify({
          ...record(context!.task.provider_route_snapshot),
          credential_source: 'platform',
          reservation_id: reservationId,
          funding: { reservation_id: reservationId, funding_account_id: accountId },
        }),
      })
      .where('id', '=', context!.task.id)
      .execute();
  }
  return { ...t, auditId, context: context!, accountId, owner };
}
const result: ExecutionResult = {
  logical_engine: 'chatgpt',
  transport_provider: 'openai',
  transport_model: 'gpt-5-mini',
  answer_text: 'Acme Running suits road use.',
  search_used: true,
  search_events: [],
  citations: [],
  retrieved_sources: [],
  finish_reason: 'stop',
  raw_finish_reason: 'completed',
  latency_ms: 30,
  provider_metadata: { query_text_available: false },
  normalized_usage: {
    uncached_input_tokens: 10,
    cached_input_tokens: 0,
    output_tokens: 5,
    reasoning_tokens: null,
    total_tokens: 15,
    web_search_requests: 1,
    provider_cost_microusd: null,
  },
};
async function runs(taskId: string) {
  const rows = await db
    .selectFrom('consumable_ledger')
    .select(['entry_kind', 'units'])
    .where('subject_id', '=', taskId)
    .where('capability_key', '=', 'prompt_runs_per_period')
    .execute();
  const total = (kind: string) =>
    rows.filter((row) => row.entry_kind === kind).reduce((sum, row) => sum + row.units, 0);
  return { consumed: total('debit'), reserved: total('reservation') - total('release') };
}
describe('atomic audit execution persistence', () => {
  it('commits evidence and the terminal queue state once, spending the task’s prompt run', async () => {
    const t = await seed(true);
    const response = {
      ...result,
      transport_model: t.context.task.transport_model,
      retrieved_sources: [
        {
          ordinal: 0,
          url: 'https://www.review.example/best',
          title: 'Best',
          domain: 'review.example',
        },
      ],
    };
    const derive = deriveExecution;
    const artifactId = await persistExecutionSuccess(db, t.context.task, t.owner, response, derive);
    expect(artifactId).toBeTruthy();
    expect(await persistExecutionSuccess(db, t.context.task, t.owner, response, derive)).toBeNull();
    const artifact = await db
      .selectFrom('raw_response_artifacts')
      .selectAll()
      .where('id', '=', artifactId!)
      .executeTakeFirstOrThrow();
    expect(record(artifact.usage)).toMatchObject({
      search_requests: 1,
      reasoning_tokens: null,
      total_output_tokens: 5,
    });
    const read = await db
      .selectFrom('retrieved_sources as source')
      .innerJoin('response_analyses as analysis', 'analysis.id', 'source.analysis_id')
      .select(['source.url', 'source.domain', 'analysis.retrieval_observed'])
      .where('source.artifact_id', '=', artifactId!)
      .execute();
    expect(read).toEqual([
      {
        url: 'https://www.review.example/best',
        domain: 'review.example',
        retrieval_observed: true,
      },
    ]);
    const attempt = await db
      .selectFrom('provider_attempts')
      .selectAll()
      .where('task_id', '=', t.context.task.id)
      .execute();
    expect(attempt).toHaveLength(1);
    expect(attempt[0]).toMatchObject({ artifact_id: artifactId, attempt_number: 1 });
    const task = await db
      .selectFrom('audit_tasks')
      .selectAll()
      .where('id', '=', t.context.task.id)
      .executeTakeFirstOrThrow();
    expect(task).toMatchObject({
      status: 'succeeded',
      lease_owner: null,
      attempt_count: 1,
      result_artifact_id: artifactId,
    });
    expect(await runs(t.context.task.id)).toEqual({
      consumed: 1,
      reserved: 0,
    });
    const projection = await db
      .selectFrom('execution_cost_projections')
      .selectAll()
      .where('task_id', '=', task.id)
      .executeTakeFirstOrThrow();
    expect(projection).toMatchObject({
      raw_response_artifact_id: artifactId,
      attempt_count: 1,
      search_requests: 1,
    });
    const analysis = await db
      .selectFrom('response_analyses')
      .selectAll()
      .where('task_id', '=', task.id)
      .executeTakeFirstOrThrow();
    expect(analysis).toMatchObject({
      artifact_id: artifactId,
      workspace_id: t.workspaceId,
      brand_mentioned: true,
    });
    expect(record(analysis.score)).toMatchObject({
      brand_injected_in_search: null,
      search_query_text_available: false,
    });
    expect(
      await db
        .selectFrom('brand_mentions')
        .select(['artifact_id', 'analysis_id'])
        .where('analysis_id', '=', analysis.id)
        .execute(),
    ).toEqual([{ artifact_id: artifactId, analysis_id: analysis.id }]);
  });
  it('rolls back raw evidence and billing when analysis cannot commit, and discards a stale worker result', async () => {
    const t = await seed(true),
      response = { ...result, transport_model: t.context.task.transport_model };
    await expect(
      persistExecutionSuccess(db, t.context.task, t.owner, response, async () => {
        throw new Error('analysis failed');
      }),
    ).rejects.toThrow('analysis failed');
    expect(
      await db
        .selectFrom('raw_response_artifacts')
        .select('id')
        .where('task_id', '=', t.context.task.id)
        .execute(),
    ).toHaveLength(0);
    expect(await runs(t.context.task.id)).toEqual({
      consumed: 0,
      reserved: 1,
    });
    await db
      .updateTable('audit_tasks')
      .set({ lease_owner: 'replacement' })
      .where('id', '=', t.context.task.id)
      .execute();
    expect(
      await persistExecutionSuccess(db, t.context.task, t.owner, response, async () => {}),
    ).toBeNull();
    expect(
      await db
        .selectFrom('provider_attempts')
        .select('id')
        .where('task_id', '=', t.context.task.id)
        .execute(),
    ).toHaveLength(0);
  });
  it('charges no run for a timeout, parks the retry, then pauses only the failing credential revision and returns the run', async () => {
    const t = await seed(true);
    const failure = await persistAnswerFailure(
      db,
      t.context.task,
      t.owner,
      new ProviderError('timeout', true),
      runtime,
      { called: true },
    );
    expect(failure).toEqual({ retry: true, attempt: 1 });
    expect(await runs(t.context.task.id)).toEqual({
      consumed: 0,
      reserved: 1,
    });
    await db
      .updateTable('audit_tasks')
      .set({ available_at: new Date(0) })
      .where('id', '=', t.context.task.id)
      .execute();
    await db
      .updateTable('audit_tasks')
      .set({
        status: 'running',
        lease_owner: 'worker',
        lease_expires_at: new Date(Date.now() + 120000),
      })
      .where('id', '=', t.context.task.id)
      .execute();
    await db
      .updateTable('provider_connections')
      .set({ credential_revision: randomUUID() })
      .where('id', '=', t.connectionId)
      .execute();
    await persistAnswerFailure(
      db,
      t.context.task,
      'worker',
      new ProviderError('auth_failure'),
      runtime,
      { called: true, context: t.context },
    );
    const connection = await db
      .selectFrom('provider_connections')
      .select('paused_at')
      .where('id', '=', t.connectionId)
      .executeTakeFirstOrThrow();
    expect(connection.paused_at).toBeNull();
    expect(await runs(t.context.task.id)).toEqual({
      consumed: 0,
      reserved: 0,
    });
  });
  it('releases an unused hold without charging a pre-call rejection', async () => {
    const t = await seed(true);
    expect(
      await persistAnswerFailure(
        db,
        t.context.task,
        t.owner,
        new ProviderError('provider_connection_missing'),
        runtime,
        { called: false },
      ),
    ).toEqual({ retry: false, attempt: 0 });
    expect(
      await db
        .selectFrom('provider_attempts')
        .select('id')
        .where('task_id', '=', t.context.task.id)
        .execute(),
    ).toEqual([]);
    expect(await runs(t.context.task.id)).toEqual({
      consumed: 0,
      reserved: 0,
    });
  });
  it('finalizes actual slot coverage once and retains source IDs in run and prompt metrics', async () => {
    const t = await seed();
    await persistExecutionSuccess(
      db,
      t.context.task,
      t.owner,
      { ...result, transport_model: t.context.task.transport_model },
      deriveExecution,
    );
    expect(await finalizeAudit(db, t.workspaceId, t.auditId, async () => {})).toBeNull();
    await db
      .updateTable('audit_tasks')
      .set({ status: 'failed', error_code: 'timeout', completed_at: new Date() })
      .where('audit_id', '=', t.auditId)
      .where('id', '!=', t.context.task.id)
      .execute();
    const metric = await finalizeAudit(db, t.workspaceId, t.auditId, async () => {});
    expect(metric).toMatchObject({ total_completed: 1, total_failed: 2 });
    expect(record(record(metric!.metrics).coverage)).toEqual({
      requested: 3,
      completed: 1,
      failed: 2,
      not_run: 0,
      unavailable: 0,
      rate: 1 / 3,
    });
    expect(record(record(metric!.metrics).all)).toMatchObject({
      cohort: 'all',
      total_completed: 1,
      coverage: { requested: 3, completed: 1 },
    });
    const analysis = await db
      .selectFrom('response_analyses')
      .selectAll()
      .where('task_id', '=', t.context.task.id)
      .executeTakeFirstOrThrow();
    expect(metric!.source_analysis_ids).toEqual([analysis.id]);
    expect(metric!.source_artifact_ids).toEqual([analysis.artifact_id]);
    expect(analysis).toMatchObject({
      first_named_kind: 'brand',
      first_named_name: 'Acme Running',
      brand_first_offset: 0,
    });
    expect(record(metric!.metrics).win_tally).toEqual({
      answers: 1,
      first: { 'Acme Running': 1 },
    });
    const prompt = await db
      .selectFrom('prompt_metric_snapshots')
      .selectAll()
      .where('audit_id', '=', t.auditId)
      .executeTakeFirstOrThrow();
    expect(prompt).toMatchObject({
      evidence_coverage: 0.3333,
      previous_score: null,
      decline_confirmed: false,
      source_artifact_ids: [analysis.artifact_id],
    });
    expect(
      (
        await db
          .selectFrom('audits')
          .select('status')
          .where('id', '=', t.auditId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('partially_completed');
    expect(await finalizeAudit(db, t.workspaceId, t.auditId, async () => {})).toBeNull();
    const foreign = await auditTenant(db, fixtures);
    expect(await finalizeAudit(db, foreign.workspaceId, t.auditId, async () => {})).toBeNull();
    const firstNamed = (kind: string | null, name: string | null) =>
      db
        .updateTable('response_analyses')
        .set({ first_named_kind: sql<string>`${kind}`, first_named_name: name })
        .where('id', '=', analysis.id)
        .executeTakeFirstOrThrow();
    await expect(firstNamed(null, null)).rejects.toMatchObject({ code: '23502' });
    await expect(firstNamed('none', 'Acme Running')).rejects.toMatchObject({ code: '23514' });
    await expect(firstNamed('other', 'Acme Running')).rejects.toMatchObject({ code: '23514' });
    await expect(firstNamed('competitor', 'Rival')).resolves.toMatchObject({
      numUpdatedRows: 1n,
    });
  });
});
