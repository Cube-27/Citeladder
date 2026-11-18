/**
 * Fact-checking against real PostgreSQL: the pilot-gated brand facts API and
 * its revisions, the fact set an audit freezes, claim extraction riding the
 * perception call, the verification executor's persisted outcomes, the
 * accuracy and evidence reads, and workspace isolation. The model gateway is
 * a fake transport.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveExecution } from '../src/audits/derivation.ts';
import { createApp } from '../src/app.ts';
import { policy } from '../src/config.ts';
import { loadWorkerSettings } from '../src/config/analytics.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { admittedFactCheck, admittedPerceptionVersions } from '../src/perception/admission.ts';
import { answerPerception } from '../src/perception/executor.ts';
import { factVerification } from '../src/perception/fact-verification.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

const config = testConfig();
const db = testDatabase(config);
const app = createApp(config, db);
const fixtures = new VisibilityFixtures(db);
const settings = loadWorkerSettings({});
const ANSWER = 'Acme Pro costs $49 per month. Acme integrates with Slack. Rival support is slow.';

let tenant: Tenant;

beforeEach(async () => {
  tenant = await fixtures.tenant();
});

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

async function enroll(owner: Tenant) {
  const account = await billingAccount(db, owner.workspaceId);
  await grant(db, account, { key: 'fact_checking', value: 1, sourceKind: 'override' });
}

async function call(owner: Tenant, method: string, path: string, body?: unknown) {
  const token = await sessionToken({ sub: owner.userId, ver: 0 });
  const response = await app.request(`/api/v1/projects/${owner.projectId}${path}`, {
    method,
    headers: {
      cookie: `${config.session.cookieName}=${token}`,
      'x-workspace-id': owner.workspaceId,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function confirmedFact(owner: Tenant, topic: string, statement: string) {
  const created = await call(owner, 'POST', '/brand-facts', { topic, statement });
  const id = String(created.body.id);
  await call(owner, 'PATCH', `/brand-facts/${id}`, { expected_revision: 1, status: 'confirmed' });
  return id;
}

/** A pilot audit's configuration, frozen the way admission freezes it. */
async function pilotConfiguration(owner: Tenant) {
  const factCheck = await admittedFactCheck(db, {
    workspaceId: owner.workspaceId,
    projectId: owner.projectId,
    auditScope: 'brand',
  });
  return {
    brand_name: 'Acme',
    brand_aliases: [],
    competitors: [{ name: 'Rival', domains: [], aliases: [] }],
    country_code: 'US',
    language_code: 'en',
    // Frozen with the fake gateway's model, as admission freezes the deployment's.
    perception: admittedPerceptionVersions({ auditScope: 'brand', factCheck, model: 'test' }),
    fact_check: factCheck,
  };
}

/** A succeeded execution analysed the way the result transaction analyses it. */
async function analysed(owner: Tenant, auditId: string, answerText = ANSWER) {
  const { taskId } = await fixtures.execution(owner, {
    auditId,
    answerText,
    promptText: 'best tools?',
    analysis: null,
  });
  const artifactId = randomUUID();
  await db
    .insertInto('raw_response_artifacts')
    .values({
      id: artifactId,
      workspace_id: owner.workspaceId,
      audit_id: auditId,
      task_id: taskId,
      logical_engine: 'chatgpt',
      transport_provider: 'test',
      transport_model: 'test-model',
      answer_text: answerText,
      search_used: false,
      finish_reason: 'stop',
      created_at: new Date(),
    })
    .execute();
  const audit = await db
    .selectFrom('audits')
    .selectAll()
    .where('id', '=', auditId)
    .executeTakeFirstOrThrow();
  const task = await db
    .selectFrom('audit_tasks')
    .selectAll()
    .where('id', '=', taskId)
    .executeTakeFirstOrThrow();
  await db.transaction().execute((trx) => deriveExecution(trx, task, audit, artifactId));
  return taskId;
}

function fakeGateway(contents: string[], model = 'test') {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json({
      model: 'returned-model',
      choices: [{ message: { content: contents.shift() ?? 'not json' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
  );
  const gateway = createModelGateway(
    {
      ...gatewaySettings({}),
      apiKey: 'test-only',
      model,
      baseUrl: 'https://model.test/v1',
    },
    { fetch, sleep: async () => {} },
  );
  return { fetch, factory: () => gateway };
}

const perceptionOutput = JSON.stringify({
  entities: [
    { entity_id: 'brand:acme', label: 'neutral', confidence: 0.9, aspects: [] },
    { entity_id: 'competitor:rival', label: 'negative', confidence: 0.8, aspects: [] },
  ],
  claims: [
    {
      topic: 'pricing',
      claim: 'Acme Pro costs $49 a month.',
      quote: 'Acme Pro costs $49 per month',
      confidence: 0.9,
    },
    {
      topic: 'integrations',
      claim: 'Acme integrates with Slack.',
      quote: 'Acme integrates with Slack',
      confidence: 0.9,
    },
    { topic: 'pricing', claim: 'Rival is cheaper.', quote: 'Rival is cheaper', confidence: 0.9 },
  ],
});

async function drain(owner: Tenant, kind: string, executor: ReturnType<typeof answerPerception>) {
  const ids = (
    await db
      .selectFrom('analytics_tasks')
      .select('id')
      .where('workspace_id', '=', owner.workspaceId)
      .where('task_kind', '=', kind)
      .execute()
  ).map((row) => row.id);
  const worker = new AnalyticsWorker(db, settings, {
    executors: { [kind]: executor },
    taskScope: { workspaceId: owner.workspaceId, taskIds: ids },
  });
  await worker.runUntilIdle();
  return ids;
}

const queued = (owner: Tenant, kind: string) =>
  db
    .selectFrom('analytics_tasks')
    .select(['status', 'payload'])
    .where('workspace_id', '=', owner.workspaceId)
    .where('task_kind', '=', kind)
    .execute();

describe('brand facts', () => {
  it('is disabled outside the pilot: an empty list and refused writes', async () => {
    expect(await call(tenant, 'GET', '/brand-facts')).toEqual({
      status: 200,
      body: { enabled: false, facts: [] },
    });
    const refused = await call(tenant, 'POST', '/brand-facts', {
      topic: 'pricing',
      statement: 'x',
    });
    expect([refused.status, (refused.body.error as { code: string }).code]).toEqual([
      409,
      'fact_checking_not_in_plan',
    ]);
  });

  it('appends a revision on every change and refuses an edit of a stale revision', async () => {
    await enroll(tenant);
    const created = await call(tenant, 'POST', '/brand-facts', {
      topic: 'pricing',
      statement: 'Pro costs $59 per month.',
    });
    expect(created.body).toMatchObject({ status: 'draft', revision: 1, source_url: null });
    const id = String(created.body.id);
    const confirmed = await call(tenant, 'PATCH', `/brand-facts/${id}`, {
      expected_revision: 1,
      status: 'confirmed',
    });
    expect(confirmed.body).toMatchObject({ status: 'confirmed', revision: 2 });
    const stale = await call(tenant, 'PATCH', `/brand-facts/${id}`, {
      expected_revision: 1,
      statement: 'Pro costs $69 per month.',
    });
    expect(stale.status).toBe(409);
    const retired = await call(tenant, 'PATCH', `/brand-facts/${id}`, {
      expected_revision: 2,
      status: 'retired',
    });
    expect(retired.body).toMatchObject({ status: 'retired', revision: 3 });
    const revived = await call(tenant, 'PATCH', `/brand-facts/${id}`, {
      expected_revision: 3,
      status: 'confirmed',
    });
    expect(revived.status).toBe(409);
    const revisions = await db
      .selectFrom('brand_fact_revisions')
      .select(['revision', 'status', 'statement', 'created_by_user_id'])
      .where('fact_id', '=', id)
      .orderBy('revision')
      .execute();
    expect(revisions).toEqual([
      {
        revision: 1,
        status: 'draft',
        statement: 'Pro costs $59 per month.',
        created_by_user_id: tenant.userId,
      },
      {
        revision: 2,
        status: 'confirmed',
        statement: 'Pro costs $59 per month.',
        created_by_user_id: tenant.userId,
      },
      {
        revision: 3,
        status: 'retired',
        statement: 'Pro costs $59 per month.',
        created_by_user_id: tenant.userId,
      },
    ]);
  });

  it('imports CSV rows as drafts only, answering each row and skipping duplicates', async () => {
    const outside = await call(tenant, 'POST', '/brand-facts/import', {
      rows: [{ topic: 'pricing', statement: 'x', source_url: null }],
    });
    expect([outside.status, (outside.body.error as { code: string }).code]).toEqual([
      409,
      'fact_checking_not_in_plan',
    ]);
    await enroll(tenant);
    await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    const imported = await call(tenant, 'POST', '/brand-facts/import', {
      rows: [
        { topic: 'Pricing', statement: 'Pro  costs $59 PER month.', source_url: null },
        { topic: 'plans', statement: 'Starter includes 5 users.', source_url: '' },
        { topic: 'weather', statement: 'Sunny.', source_url: null },
        { topic: 'plans', statement: 'starter includes 5 users.', source_url: null },
        { topic: 'company', statement: 'Founded in 2019.', source_url: 'ftp://acme.test' },
      ],
    });
    expect(imported.status).toBe(200);
    const rows = imported.body.rows as { index: number; kind: string; fact_id?: string }[];
    expect(rows.map(({ index, kind }) => [index, kind])).toEqual([
      [0, 'duplicate'],
      [1, 'created'],
      [2, 'invalid'],
      [3, 'duplicate'],
      [4, 'invalid'],
    ]);
    const facts = (await call(tenant, 'GET', '/brand-facts')).body.facts as {
      id: string;
      statement: string;
      status: string;
    }[];
    expect(facts.map(({ statement, status }) => [statement, status])).toEqual([
      ['Pro costs $59 per month.', 'confirmed'],
      ['Starter includes 5 users.', 'draft'],
    ]);
    expect(facts[1]!.id).toBe(rows[1]!.fact_id);
    const revisions = await db
      .selectFrom('brand_fact_revisions')
      .select(['status', 'created_by_user_id'])
      .where('fact_id', '=', rows[1]!.fact_id!)
      .execute();
    expect(revisions).toEqual([{ status: 'draft', created_by_user_id: tenant.userId }]);
    // A draft is never frozen into a run.
    const frozen = await admittedFactCheck(db, {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      auditScope: 'brand',
    });
    expect(frozen?.facts.map((fact) => fact.topic)).toEqual(['pricing']);
  });

  it("never reads or edits another workspace's facts", async () => {
    await enroll(tenant);
    const id = await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    const other = await fixtures.tenant();
    await enroll(other);
    expect((await call(other, 'GET', '/brand-facts')).body).toEqual({ enabled: true, facts: [] });
    const forged = await call(other, 'PATCH', `/brand-facts/${id}`, {
      expected_revision: 2,
      status: 'retired',
    });
    expect(forged.status).toBe(404);
  });

  it('freezes only the newest confirmed revisions, and nothing outside the pilot', async () => {
    expect(
      await admittedFactCheck(db, {
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        auditScope: 'brand',
      }),
    ).toBeNull();
    await enroll(tenant);
    const confirmed = await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    await call(tenant, 'PATCH', `/brand-facts/${confirmed}`, {
      expected_revision: 2,
      statement: 'Pro costs $69 per month.',
    });
    await call(tenant, 'POST', '/brand-facts', { topic: 'company', statement: 'Draft only.' });
    const retired = await confirmedFact(tenant, 'markets', 'Sold in the US.');
    await call(tenant, 'PATCH', `/brand-facts/${retired}`, {
      expected_revision: 2,
      status: 'retired',
    });
    const frozen = await admittedFactCheck(db, {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      auditScope: 'brand',
    });
    const newest = await db
      .selectFrom('brand_fact_revisions')
      .select('id')
      .where('fact_id', '=', confirmed)
      .where('revision', '=', 3)
      .executeTakeFirstOrThrow();
    expect(frozen?.facts).toEqual([{ revision_id: newest.id, topic: 'pricing' }]);
    expect(
      await admittedFactCheck(db, {
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        auditScope: 'commerce',
      }),
    ).toBeNull();
  });
});

describe('claim extraction and verification', () => {
  it('extracts brand claims in the perception call, verifies them against the frozen facts and reads the accuracy', async () => {
    await enroll(tenant);
    await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    await confirmedFact(tenant, 'company', 'Founded in 2019.');
    const auditId = await fixtures.audit(tenant, {
      configuration: await pilotConfiguration(tenant),
    });
    const taskId = await analysed(tenant, auditId);
    const perception = fakeGateway([perceptionOutput]);
    await drain(tenant, 'answer_perception', answerPerception(perception.factory));
    const sent = JSON.parse(String(perception.fetch.mock.calls[0]?.[1]?.body)) as {
      messages: { content: string }[];
    };
    expect(
      sent.messages[0]?.content.endsWith(policy.perception.fact_check.claims_system_addendum),
    ).toBe(true);
    const claims = await db
      .selectFrom('answer_claims')
      .select(['topic', 'quote', 'quote_start', 'quote_end'])
      .where('workspace_id', '=', tenant.workspaceId)
      .orderBy('ordinal')
      .execute();
    expect(claims).toEqual([
      { topic: 'pricing', quote: 'Acme Pro costs $49 per month', quote_start: 0, quote_end: 28 },
      {
        topic: 'integrations',
        quote: 'Acme integrates with Slack',
        quote_start: 30,
        quote_end: 56,
      },
    ]);
    expect((await queued(tenant, 'fact_verification')).map((row) => row.status)).toEqual([
      'queued',
    ]);

    const verify = fakeGateway([
      JSON.stringify({
        verdicts: [{ claim_id: 'c1', verdict: 'contradicted', fact_ids: ['f1'], confidence: 0.9 }],
      }),
    ]);
    await drain(tenant, 'fact_verification', factVerification(verify.factory));
    const verifyRequest = JSON.parse(String(verify.fetch.mock.calls[0]?.[1]?.body)) as {
      messages: { content: string }[];
    };
    // Only the pricing claim has a fact on its topic; the integration claim is never sent.
    expect(verifyRequest.messages[1]?.content).toContain('Pro costs $59 per month.');
    expect(verifyRequest.messages[1]?.content).not.toContain('Slack');

    const summary = await call(tenant, 'GET', `/visibility/accuracy?audit_id=${auditId}`);
    expect(summary.body).toMatchObject({
      state: 'value',
      score: {
        accuracy: 0,
        coverage: { claims: 2, contradicted: 1, not_covered: 1, supported: 0, pending: 0 },
      },
      contradicted: [
        {
          quote: 'Acme Pro costs $49 per month',
          topic: 'pricing',
          verdict: 'contradicted',
          facts: [{ topic: 'pricing', statement: 'Pro costs $59 per month.', source_url: null }],
          run_id: auditId,
          execution_id: taskId,
        },
      ],
    });

    // Editing the fact afterwards never rewrites this audit's verdict.
    const [fact] = (await call(tenant, 'GET', '/brand-facts')).body.facts as { id: string }[];
    await call(tenant, 'PATCH', `/brand-facts/${fact!.id}`, {
      expected_revision: 2,
      statement: 'Pro costs $49 per month.',
    });
    const token = await sessionToken({ sub: tenant.userId, ver: 0 });
    const execution = (await (
      await app.request(`/api/v1/executions/${taskId}`, {
        headers: {
          cookie: `${config.session.cookieName}=${token}`,
          'x-workspace-id': tenant.workspaceId,
        },
      })
    ).json()) as { claims: { verdict: string | null; facts: { statement: string }[] }[] };
    expect(execution.claims.map((row) => [row.verdict, row.facts.map((f) => f.statement)])).toEqual(
      [
        ['contradicted', ['Pro costs $59 per month.']],
        ['not_covered', []],
      ],
    );

    // By fact groups on the revision the run froze; the unclaimed fact is not raised.
    const observedAt = (summary.body.contradicted as { observed_at: string }[])[0]!.observed_at;
    const byFact = await call(tenant, 'GET', `/visibility/accuracy/facts?audit_id=${auditId}`);
    expect(byFact.body).toMatchObject({
      enabled: true,
      facts: [
        {
          fact_id: fact!.id,
          revision: 2,
          statement: 'Pro costs $59 per month.',
          counts: {
            kind: 'raised',
            claims: 1,
            supported: 0,
            contradicted: 1,
            inconclusive: 0,
            last_raised_at: observedAt,
          },
        },
        { revision: 2, statement: 'Founded in 2019.', counts: { kind: 'not_raised' } },
      ],
    });

    // The export names the market the run froze, not the project's current default.
    await db
      .updateTable('projects')
      .set({ country_code: 'GB' })
      .where('id', '=', tenant.projectId)
      .execute();
    const csv = await app.request(
      `/api/v1/projects/${tenant.projectId}/visibility/accuracy/claims/export?audit_id=${auditId}`,
      {
        headers: {
          cookie: `${config.session.cookieName}=${token}`,
          'x-workspace-id': tenant.workspaceId,
        },
      },
    );
    expect(csv.headers.get('content-disposition')).toBe(
      'attachment; filename="fact-check-claims.csv"',
    );
    const market = 'United States · English';
    expect(await csv.text()).toBe(
      'claim,facts,verdict,model_verdict,engine,market,run_date,prompt\r\n' +
        `Acme Pro costs $49 a month.,Pro costs $59 per month. (revision 2),contradicted,,chatgpt,${market},${observedAt},best tools?\r\n` +
        `Acme integrates with Slack.,,not_covered,,chatgpt,${market},${observedAt},best tools?\r\n`,
    );

    // Another workspace, inside the pilot, cannot read this run's facts or claims.
    const attacker = await fixtures.tenant();
    await enroll(attacker);
    const forged = await call(attacker, 'GET', `/visibility/accuracy/facts?audit_id=${auditId}`);
    expect(forged.status).toBe(404);
    const forgedCsv = await call(
      attacker,
      'GET',
      `/visibility/accuracy/claims/export?audit_id=${auditId}`,
    );
    expect(forgedCsv.status).toBe(404);
  });

  it('verifies a claim the extractor filed under a neighbouring topic instead of calling it not covered', async () => {
    await enroll(tenant);
    await confirmedFact(tenant, 'specs', 'The Pro plan includes 50 projects.');
    const auditId = await fixtures.audit(tenant, {
      configuration: await pilotConfiguration(tenant),
    });
    await analysed(tenant, auditId, 'Acme Pro includes unlimited projects. Rival support is slow.');
    const extraction = JSON.stringify({
      entities: [{ entity_id: 'brand:acme', label: 'neutral', confidence: 0.9, aspects: [] }],
      claims: [
        {
          topic: 'plans',
          claim: 'Acme Pro includes unlimited projects.',
          quote: 'Acme Pro includes unlimited projects',
          confidence: 0.9,
        },
      ],
    });
    await drain(tenant, 'answer_perception', answerPerception(fakeGateway([extraction]).factory));
    const verify = fakeGateway([
      JSON.stringify({
        verdicts: [{ claim_id: 'c1', verdict: 'contradicted', fact_ids: ['f1'], confidence: 0.9 }],
      }),
    ]);
    await drain(tenant, 'fact_verification', factVerification(verify.factory));
    const request = JSON.parse(String(verify.fetch.mock.calls[0]?.[1]?.body)) as {
      messages: { content: string }[];
    };
    expect(request.messages[1]?.content).toContain('The Pro plan includes 50 projects.');
    const summary = await call(tenant, 'GET', `/visibility/accuracy?audit_id=${auditId}`);
    expect(summary.body).toMatchObject({
      score: { coverage: { claims: 1, contradicted: 1, not_covered: 0 } },
      contradicted: [
        { topic: 'plans', facts: [{ statement: 'The Pro plan includes 50 projects.' }] },
      ],
    });
  });

  it('extracts no claims for an audit admitted outside the pilot', async () => {
    const configuration = await pilotConfiguration(tenant);
    expect(configuration.fact_check).toBeNull();
    const auditId = await fixtures.audit(tenant, { configuration });
    await analysed(tenant, auditId);
    const perception = fakeGateway([perceptionOutput]);
    await drain(tenant, 'answer_perception', answerPerception(perception.factory));
    const sent = JSON.parse(String(perception.fetch.mock.calls[0]?.[1]?.body)) as {
      messages: { content: string }[];
    };
    expect(sent.messages[0]?.content).toBe(policy.perception.system_template);
    const claims = await db
      .selectFrom('answer_claims')
      .select('id')
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
    expect([claims.length, (await queued(tenant, 'fact_verification')).length]).toEqual([0, 0]);
    const accuracy = await call(tenant, 'GET', `/visibility/accuracy?audit_id=${auditId}`);
    expect(accuracy.body.state).toBe('not_enabled');
  });

  it('ends over the cap or without a gateway as an explained unavailable outcome', async () => {
    await enroll(tenant);
    await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    const auditId = await fixtures.audit(tenant, {
      configuration: await pilotConfiguration(tenant),
    });
    await analysed(tenant, auditId);
    await analysed(tenant, auditId, `${ANSWER} Again.`);
    await drain(
      tenant,
      'answer_perception',
      answerPerception(fakeGateway([perceptionOutput, perceptionOutput]).factory),
    );
    const verify = fakeGateway([
      JSON.stringify({
        verdicts: [{ claim_id: 'c1', verdict: 'supported', fact_ids: ['f1'], confidence: 0.9 }],
      }),
    ]);
    await drain(
      tenant,
      'fact_verification',
      factVerification(verify.factory, {
        ...policy.perception.fact_check,
        max_verifications_per_audit: 1,
      }),
    );
    const outcomes = await db
      .selectFrom('fact_verifications')
      .select(['outcome', 'outcome_reason'])
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
    expect(outcomes.map((row) => row.outcome_reason ?? row.outcome).toSorted()).toEqual([
      'platform_cap',
      'verified',
    ]);
    expect(verify.fetch).toHaveBeenCalledTimes(1);
    const summary = await call(tenant, 'GET', `/visibility/accuracy?audit_id=${auditId}`);
    expect(summary.body).toMatchObject({
      state: 'value',
      score: { coverage: { supported: 1, unavailable: [{ reason: 'platform_cap', count: 1 }] } },
    });

    const second = await fixtures.tenant();
    await enroll(second);
    await confirmedFact(second, 'pricing', 'Pro costs $59 per month.');
    const secondAudit = await fixtures.audit(second, {
      configuration: await pilotConfiguration(second),
    });
    await analysed(second, secondAudit);
    await drain(
      second,
      'answer_perception',
      answerPerception(fakeGateway([perceptionOutput]).factory),
    );
    await drain(
      second,
      'fact_verification',
      factVerification(() => null),
    );
    const unconfigured = await call(second, 'GET', `/visibility/accuracy?audit_id=${secondAudit}`);
    // The integration claim has no fact on its topic, so it is not covered without a call.
    expect(unconfigured.body).toMatchObject({
      state: 'value',
      score: {
        accuracy: null,
        coverage: { not_covered: 1, unavailable: [{ reason: 'model_not_configured', count: 1 }] },
      },
    });
  });

  it('counts the newest verdict override, keeps the model verdict and refuses other workspaces', async () => {
    await enroll(tenant);
    await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    const auditId = await fixtures.audit(tenant, {
      configuration: await pilotConfiguration(tenant),
    });
    await analysed(tenant, auditId);
    await drain(
      tenant,
      'answer_perception',
      answerPerception(fakeGateway([perceptionOutput]).factory),
    );
    const verdicts = [
      { claim_id: 'c1', verdict: 'contradicted', fact_ids: ['f1'], confidence: 0.9 },
    ];
    await drain(
      tenant,
      'fact_verification',
      factVerification(fakeGateway([JSON.stringify({ verdicts })]).factory),
    );
    type Item = { topic: string; verdict: string; verdict_id: string | null; edited: unknown };
    const claims = async () =>
      (await call(tenant, 'GET', `/visibility/accuracy/claims?audit_id=${auditId}`)).body
        .items as Item[];
    const before = await claims();
    // Only a verified claim can be overridden; a claim no fact covers has no verdict row.
    expect(before.map((item) => [item.topic, item.verdict_id === null, item.edited])).toEqual([
      ['pricing', false, null],
      ['integrations', true, null],
    ]);
    const verdictId = before[0]!.verdict_id!;
    const path = `/claim-verdicts/${verdictId}/overrides`;
    const override = (owner: Tenant, verdict: string, note?: string) =>
      call(owner, 'POST', path, { verdict, note });

    const outside = await fixtures.tenant();
    const refused = await override(outside, 'supported');
    expect([refused.status, (refused.body.error as { code: string }).code]).toEqual([
      409,
      'fact_checking_not_in_plan',
    ]);
    const attacker = await fixtures.tenant();
    await enroll(attacker);
    expect((await override(attacker, 'supported')).status).toBe(404);
    expect((await override(tenant, 'contradicted')).status).toBe(409);

    const first = await override(tenant, 'inconclusive', ' Checked the pricing page ');
    expect(first.body).toMatchObject({
      verdict_id: verdictId,
      model_verdict: 'contradicted',
      verdict: 'inconclusive',
      note: 'Checked the pricing page',
    });
    expect((await override(tenant, 'supported')).status).toBe(200);
    const summary = await call(tenant, 'GET', `/visibility/accuracy?audit_id=${auditId}`);
    expect(summary.body).toMatchObject({
      score: {
        accuracy: 1,
        coverage: { supported: 1, contradicted: 0, inconclusive: 0, not_covered: 1, edited: 1 },
      },
      contradicted: [],
    });
    expect((await claims())[0]).toMatchObject({
      verdict: 'supported',
      edited: { model_verdict: 'contradicted', note: null },
    });

    // The model's verdict stays as it was, and every change is kept in order.
    const model = await db
      .selectFrom('claim_verdicts')
      .select('verdict')
      .where('id', '=', verdictId)
      .executeTakeFirstOrThrow();
    expect(model.verdict).toBe('contradicted');
    const history = await db
      .selectFrom('claim_verdict_overrides')
      .select(['from_verdict', 'to_verdict', 'created_by_user_id'])
      .where('workspace_id', '=', tenant.workspaceId)
      .orderBy('created_at')
      .execute();
    expect(history).toEqual([
      {
        from_verdict: 'contradicted',
        to_verdict: 'inconclusive',
        created_by_user_id: tenant.userId,
      },
      { from_verdict: 'contradicted', to_verdict: 'supported', created_by_user_id: tenant.userId },
    ]);

    // Changing back to the model's verdict clears the edit mark.
    expect((await override(tenant, 'contradicted')).status).toBe(200);
    const reverted = await call(tenant, 'GET', `/visibility/accuracy?audit_id=${auditId}`);
    expect(reverted.body).toMatchObject({
      score: { accuracy: 0, coverage: { contradicted: 1, edited: 0 } },
    });
  });

  it('counts any verdict a person gives a low-confidence claim as edited', async () => {
    await enroll(tenant);
    await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    const auditId = await fixtures.audit(tenant, {
      configuration: await pilotConfiguration(tenant),
    });
    await analysed(tenant, auditId);
    await drain(
      tenant,
      'answer_perception',
      answerPerception(fakeGateway([perceptionOutput]).factory),
    );
    // An unsure "supported" is stored as inconclusive and reads as low confidence.
    const verdicts = [{ claim_id: 'c1', verdict: 'supported', fact_ids: ['f1'], confidence: 0.3 }];
    await drain(
      tenant,
      'fact_verification',
      factVerification(fakeGateway([JSON.stringify({ verdicts })]).factory),
    );
    const claims = async () =>
      (await call(tenant, 'GET', `/visibility/accuracy/claims?audit_id=${auditId}`)).body.items as {
        status: string;
        verdict: string | null;
        verdict_id: string;
        edited: unknown;
      }[];
    const [before] = await claims();
    expect([before!.status, before!.verdict]).toEqual(['low_confidence', null]);

    const settled = await call(tenant, 'POST', `/claim-verdicts/${before!.verdict_id}/overrides`, {
      verdict: 'inconclusive',
    });
    expect(settled.status).toBe(200);
    expect((await claims())[0]).toMatchObject({
      status: 'verdict',
      verdict: 'inconclusive',
      edited: { model_verdict: 'inconclusive' },
    });
    const summary = await call(tenant, 'GET', `/visibility/accuracy?audit_id=${auditId}`);
    expect(summary.body).toMatchObject({
      score: { coverage: { inconclusive: 1, low_confidence: 0, edited: 1 } },
    });
  });

  it('never verifies claims with a model other than the one the audit froze', async () => {
    await enroll(tenant);
    await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    const auditId = await fixtures.audit(tenant, {
      configuration: await pilotConfiguration(tenant),
    });
    await analysed(tenant, auditId);
    await drain(
      tenant,
      'answer_perception',
      answerPerception(fakeGateway([perceptionOutput]).factory),
    );
    const verify = fakeGateway([], 'redeployed-model');
    await drain(tenant, 'fact_verification', factVerification(verify.factory));

    const read = await call(tenant, 'GET', `/visibility/accuracy?audit_id=${auditId}`);
    expect(read.body).toMatchObject({
      state: 'value',
      score: {
        accuracy: null,
        coverage: { not_covered: 1, unavailable: [{ reason: 'model_changed', count: 1 }] },
      },
    });
    expect(verify.fetch).not.toHaveBeenCalled();
  });

  it('never reads or writes another workspace through a forged payload', async () => {
    await enroll(tenant);
    await confirmedFact(tenant, 'pricing', 'Pro costs $59 per month.');
    const auditId = await fixtures.audit(tenant, {
      configuration: await pilotConfiguration(tenant),
    });
    await analysed(tenant, auditId);
    await drain(
      tenant,
      'answer_perception',
      answerPerception(fakeGateway([perceptionOutput]).factory),
    );
    const [victim] = await queued(tenant, 'fact_verification');
    const attacker = await fixtures.tenant();
    await db
      .insertInto('analytics_tasks')
      .values({
        id: randomUUID(),
        workspace_id: attacker.workspaceId,
        project_id: attacker.projectId,
        task_kind: 'fact_verification',
        payload: JSON.stringify(victim!.payload),
        idempotency_key: `forged:${randomUUID()}`,
        status: 'queued',
        priority: 0,
        randomized_position: 0,
        available_at: new Date(),
        attempt_count: 0,
        max_attempts: 1,
        error_code: '',
        error_detail: '',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    const gateway = fakeGateway([]);
    await drain(attacker, 'fact_verification', factVerification(gateway.factory));
    expect(gateway.fetch).not.toHaveBeenCalled();
    expect((await queued(attacker, 'fact_verification')).map((row) => row.status)).toEqual([
      'failed',
    ]);
    const written = await db
      .selectFrom('fact_verifications')
      .select('id')
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
    expect(written).toEqual([]);
  });
});
