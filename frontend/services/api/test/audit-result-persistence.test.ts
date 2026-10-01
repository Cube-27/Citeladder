import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { auditTenant, auditTestKey } from './audit-fixtures.ts';
import { billingAccount } from './prompt-fixtures.ts';
import { createAudit } from '../src/audits/creation.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { auditRuntime } from '../src/audits/config.ts';
import { AuditQueue } from '../src/queue/audit-queue.ts';
import { loadExecutionContext } from '../src/audits/execution-context.ts';
import {
  persistExecutionSuccess,
  persistExecutionFailure,
  type ExecutionResult,
} from '../src/audits/result-persistence.ts';
import { ProviderError } from '../src/answer-engines/contracts.ts';
import { issueBundle } from '../src/entitlements/grants.ts';
import { reserveUsage, ledgerBalances } from '../src/entitlements/ledger.ts';
import { record } from '../src/db/json.ts';
import { analyzeExecution } from '../src/analysis/execution.ts';
import { finalizeAudit } from '../src/analysis/finalization.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db),
  runtime = auditRuntime({});
const queue = new AuditQueue(db, 120),
  tasks: string[] = [],
  workspaces: string[] = [];
afterEach(async () => {
  if (tasks.length) {
    await db.deleteFrom('execution_cost_projections').where('task_id', 'in', tasks).execute();
    await db.deleteFrom('provider_attempts').where('task_id', 'in', tasks).execute();
  }
  if (workspaces.length)
    await db.deleteFrom('consumable_ledger').where('workspace_id', 'in', workspaces).execute();
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
  const auditId = await createAudit(
    db,
    t.workspaceId,
    auditInput.parse({ project_id: t.projectId, prompt_set_id: t.setId, engines: ['chatgpt'] }),
    {},
    runtime,
  );
  const [claimed] = await queue.claim('worker');
  const running = await queue.markRunning(claimed!, 'worker');
  const context = await loadExecutionContext(
    db,
    running!.task,
    'worker',
    runtime,
    auditTestKey,
    new Date(),
    {},
  );
  tasks.push(context!.task.id);
  let accountId = '',
    grantId = '';
  if (funded) {
    accountId = await billingAccount(db, t.workspaceId);
    const at = new Date();
    const grants = await db.transaction().execute((trx) =>
      issueBundle(trx, {
        workspaceId: t.workspaceId,
        accountId,
        key: randomUUID(),
        sourceKind: 'override',
        sourceRef: 'fixture',
        specs: [{ key: 'audit_credits', value: 5 }],
        revision: 'fixture',
        from: at,
        until: null,
        primary: false,
        profile: '',
        priority: 0,
      }),
    );
    grantId = grants[0]!.id;
    const reservationId = await db.transaction().execute((trx) =>
      reserveUsage(trx, {
        accountId,
        capability: 'audit_credits',
        subject: { kind: 'audit', id: context!.task.id, workspaceId: t.workspaceId, auditId },
        units: 5,
        key: randomUUID(),
        at,
      }),
    );
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
  return { ...t, auditId, context: context!, accountId, grantId };
}
const result: ExecutionResult = {
  logical_engine: 'chatgpt',
  transport_provider: 'openai',
  transport_model: 'gpt-5-mini',
  answer_text: 'Acme Running suits road use.',
  search_used: true,
  search_events: [],
  citations: [],
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
describe('atomic audit execution persistence', () => {
  it('commits evidence and the terminal queue state once, billing one call and releasing the remainder', async () => {
    const t = await seed(true);
    const response = { ...result, transport_model: t.context.task.transport_model };
    const derive = analyzeExecution;
    const artifactId = await persistExecutionSuccess(
      db,
      t.context.task,
      'worker',
      response,
      derive,
    );
    expect(artifactId).toBeTruthy();
    expect(
      await persistExecutionSuccess(db, t.context.task, 'worker', response, derive),
    ).toBeNull();
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
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
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
      persistExecutionSuccess(db, t.context.task, 'worker', response, async () => {
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
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
      consumed: 0,
      reserved: 5,
    });
    await db
      .updateTable('audit_tasks')
      .set({ lease_owner: 'replacement' })
      .where('id', '=', t.context.task.id)
      .execute();
    expect(
      await persistExecutionSuccess(db, t.context.task, 'worker', response, async () => {}),
    ).toBeNull();
    expect(
      await db
        .selectFrom('provider_attempts')
        .select('id')
        .where('task_id', '=', t.context.task.id)
        .execute(),
    ).toHaveLength(0);
  });
  it('bills a timeout once, parks the retry, then pauses only the failing credential revision', async () => {
    const t = await seed(true);
    const failure = await persistExecutionFailure(
      db,
      t.context.task,
      'worker',
      new ProviderError('timeout', true),
      runtime,
    );
    expect(failure).toEqual({ retry: true, attempt: 1 });
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
      consumed: 1,
      reserved: 4,
    });
    await db
      .updateTable('audit_tasks')
      .set({ available_at: new Date(0) })
      .where('id', '=', t.context.task.id)
      .execute();
    // Other repetitions are left queued; direct claim of this retry gives the next owner its lease.
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
    await persistExecutionFailure(
      db,
      t.context.task,
      'worker',
      new ProviderError('auth_failure'),
      runtime,
      { context: t.context },
    );
    const connection = await db
      .selectFrom('provider_connections')
      .select('paused_at')
      .where('id', '=', t.connectionId)
      .executeTakeFirstOrThrow();
    expect(connection.paused_at).toBeNull();
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
      consumed: 2,
      reserved: 0,
    });
  });
  it('releases an unused hold without charging a pre-call rejection', async () => {
    const t = await seed(true);
    expect(
      await persistExecutionFailure(
        db,
        t.context.task,
        'worker',
        new ProviderError('provider_connection_missing'),
        runtime,
        { preCall: true },
      ),
    ).toEqual({ retry: false, attempt: 1 });
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
      consumed: 0,
      reserved: 0,
    });
  });
  it('finalizes actual slot coverage once and retains source IDs in run and prompt metrics', async () => {
    const t = await seed();
    await persistExecutionSuccess(
      db,
      t.context.task,
      'worker',
      { ...result, transport_model: t.context.task.transport_model },
      analyzeExecution,
    );
    expect(await finalizeAudit(db, t.workspaceId, t.auditId, async () => {})).toBeNull();
    // Other frozen repetitions failed; they remain in the requested denominator.
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
    const analysis = await db
      .selectFrom('response_analyses')
      .selectAll()
      .where('task_id', '=', t.context.task.id)
      .executeTakeFirstOrThrow();
    expect(metric!.source_analysis_ids).toEqual([analysis.id]);
    expect(metric!.source_artifact_ids).toEqual([analysis.artifact_id]);
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
  });
});
