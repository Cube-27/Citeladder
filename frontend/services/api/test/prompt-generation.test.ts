import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enforceWorkspaceRequest, agentCallLimit } from '../src/abuse/usage.ts';
import { policy } from '../src/config.ts';
import { createApp } from '../src/app.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { createJevClient, jevSettings } from '../src/models/jev.ts';
import { reviewCandidates } from '../src/prompts/candidates.ts';
import { generationInput } from '../src/prompts/generation-input.ts';
import { promptTextHash } from '../src/prompts/normalization.ts';
import { generatePrompts } from '../src/prompts/generation.ts';
import { billingAccount, grant, promptSet, topic } from './prompt-fixtures.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db);
let tenant: Tenant, setId: string;
beforeEach(async () => {
  tenant = await fixtures.tenant();
  await fixtures.brand(tenant.projectId, 'Acme');
  setId = await promptSet(db, tenant.projectId);
  await topic(db, tenant.projectId, 'Running shoes');
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});
afterEach(() => vi.unstubAllEnvs());

function dependencies(judgeProbability?: number) {
  const io = {
    fetch: vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompts: [
                  {
                    slot_id: 'q1',
                    text: 'Which running shoes cushion sore knees?',
                    buyer_stage: 'consideration',
                    prompt_intent: 'recommend',
                  },
                  {
                    slot_id: 'q2',
                    text: 'Which running shoes grip wet trails?',
                    buyer_stage: 'decision',
                    prompt_intent: 'buy',
                  },
                ],
              }),
            },
          },
        ],
      }),
    ),
    sleep: async () => {},
  };
  const gateway = createModelGateway(
    { ...gatewaySettings({}), apiKey: 'test-only', model: 'test', baseUrl: 'https://model.test' },
    io,
  );
  const judge =
    judgeProbability === undefined
      ? null
      : createJevClient(
          { ...jevSettings({}), apiKey: 'test-only' },
          {
            fetch: async () =>
              Response.json({
                model: 'test-judge',
                answers: Object.fromEntries(
                  Object.keys(policy.models.quality.noul_questions).map((key) => [
                    key,
                    { noul: judgeProbability },
                  ]),
                ),
              }),
            sleep: async () => {},
          },
        );
  return { gateway: () => gateway, judge: () => judge, io };
}
/**
 * A gateway that answers every planned slot of a batch with a distinct question,
 * or fails the calls `fail` names (1-based) with a non-retried provider error.
 */
function echoDependencies(fail: number[] = [], onCall?: (call: number) => void) {
  let calls = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const call = ++calls;
    onCall?.(call);
    if (fail.includes(call)) return new Response('bad request', { status: 400 });
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const user = JSON.parse(body.messages[1]!.content.split('\n\nReturn only JSON')[0]!) as {
      slots: { slot_id: string }[];
    };
    const prompts = user.slots.map((slot) => ({
      slot_id: slot.slot_id,
      text: `Which running shoes suit runner ${slot.slot_id} best?`,
      buyer_stage: 'consideration',
      prompt_intent: 'recommend',
    }));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ prompts }) } }] });
  });
  const gateway = createModelGateway(
    { ...gatewaySettings({}), apiKey: 'test-only', model: 'test', baseUrl: 'https://model.test' },
    { fetch, sleep: async () => {} },
  );
  return { gateway: () => gateway, judge: () => null, io: { fetch } };
}
const oneSlotBatches = () => {
  vi.stubEnv('GENERATION_MODEL_BATCH_SIZE', '1');
  vi.stubEnv('GENERATION_DRAFT_CONCURRENCY', '1');
};
const input = () => generationInput.parse({ count: 2 });
const generate = (deps: Parameters<typeof generatePrompts>[4] = dependencies()) =>
  generatePrompts(db, tenant.workspaceId, setId, input(), deps);

describe('prompt generation at the PostgreSQL boundary', () => {
  it('admits only scoped saved portfolios without model generation and preserves revision provenance', async () => {
    const now = new Date(),
      chatId = randomUUID(),
      outputId = randomUUID(),
      revisionId = randomUUID();
    const scope = { workspace_id: tenant.workspaceId, project_id: tenant.projectId };
    const selected = await db
      .selectFrom('topics')
      .select('id')
      .where('project_id', '=', tenant.projectId)
      .executeTakeFirstOrThrow();
    await db
      .insertInto('agent_chats')
      .values({
        ...scope,
        id: chatId,
        action_id: null,
        archived_at: null,
        context_refs: '[]',
        created_by_user_id: tenant.userId,
        pinned_skill_id: null,
        title: 'Portfolio',
        turn_count: 0,
        created_at: now,
        updated_at: now,
        last_activity_at: now,
      })
      .execute();
    await db
      .insertInto('agent_outputs')
      .values({
        ...scope,
        id: outputId,
        chat_id: chatId,
        action_id: null,
        format_id: null,
        kind: 'prompt_portfolio',
        phase: 'draft',
        skill_id: 'prompt_discovery',
        target_kind: null,
        target_label: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto('agent_output_revisions')
      .values({
        ...scope,
        id: revisionId,
        output_id: outputId,
        number: 1,
        author: 'user',
        author_user_id: tenant.userId,
        phase: 'draft',
        title: 'Portfolio',
        body:
          '```JSON \n' +
          JSON.stringify({
            prompts: [
              {
                topic_id: selected.id,
                text: 'Which running shoes cushion knees?',
                buyer_stage: 'consideration',
                prompt_intent: 'recommend',
              },
              {
                topic_id: randomUUID(),
                text: 'Which running shoes suit wide feet?',
                buyer_stage: 'decision',
                prompt_intent: 'buy',
              },
            ],
          }) +
          '\n```',
        source_refs: '[]',
        approved_at: null,
        approved_by_user_id: null,
        message_id: null,
        parent_revision_id: null,
        run_id: null,
        created_at: now,
      })
      .execute();
    const deps = dependencies(),
      request = generationInput.parse({ agent_revision_id: revisionId });
    const result = await generatePrompts(db, tenant.workspaceId, setId, request, deps);
    expect(result.candidates).toHaveLength(1);
    expect(result.admission_drops).toEqual({ unknown_topic: 1 });
    expect(deps.io.fetch).not.toHaveBeenCalled();
    const run = await db
      .selectFrom('prompt_generation_runs')
      .select('provenance')
      .where('id', '=', result.candidates[0]!.run_id)
      .executeTakeFirstOrThrow();
    expect(run.provenance).toMatchObject({
      agent_revision_id: revisionId,
      agent_output_id: outputId,
      admission_drops: { unknown_topic: 1 },
      generator_version: policy.prompts.generation.version,
      buyer_query_policy_version: policy.prompts.generation.policy_version,
      admission_drop_records: [
        {
          reason: 'unknown_topic',
          slot_id: 'agent-2',
          normalized_text_hash: promptTextHash('Which running shoes suit wide feet?'),
          phase: 'admission',
          batch: 0,
          row_index: 1,
        },
      ],
    });
    const repeated = await generatePrompts(db, tenant.workspaceId, setId, request, deps);
    expect(repeated.candidates).toEqual([]);
    expect(repeated.admission_drops).toEqual({ unknown_topic: 1, duplicate: 1 });
    const other = await fixtures.tenant(),
      otherSet = await promptSet(db, other.projectId);
    await topic(db, other.projectId, 'Running shoes');
    await expect(
      generatePrompts(db, other.workspaceId, otherSet, request, deps),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('stages candidates, preserves provenance, and does not consume slots until acceptance', async () => {
    const result = await generate();
    expect(result.candidates).toHaveLength(2);
    expect(
      await db.selectFrom('prompts').select('id').where('prompt_set_id', '=', setId).execute(),
    ).toEqual([]);
    const run = await db
      .selectFrom('prompt_generation_runs')
      .select('provenance')
      .where('id', '=', result.candidates[0]!.run_id)
      .executeTakeFirstOrThrow();
    expect(run.provenance).toMatchObject({ generation_mode: 'model', quality_gate: 'off' });
    const account = await billingAccount(db, tenant.workspaceId);
    await grant(db, account, { value: 1 });
    await expect(
      reviewCandidates(db, tenant.workspaceId, setId, {
        accept_ids: result.candidates.map((row) => row.id),
        reject_ids: [],
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await db.selectFrom('prompts').select('id').where('prompt_set_id', '=', setId).execute(),
    ).toEqual([]);
  });
  it('keeps strong JEV failures only as text-free outcomes', async () => {
    const result = await generate(dependencies(0.01));
    expect(result.candidates).toEqual([]);
    expect(result.quality_rejected).toBe(2);
    const rows = await db
      .selectFrom('prompt_candidates')
      .select(['text', 'normalized_text_hash', 'disposition'])
      .where('prompt_set_id', '=', setId)
      .execute();
    expect(rows).toEqual(
      Array.from({ length: 2 }, () => ({
        text: '',
        normalized_text_hash: '',
        disposition: 'gate_rejected',
      })),
    );
  });
  it('reserves the shared agent budget before provider I/O and refuses excess on an empty window', async () => {
    const limit = agentCallLimit(1);
    await expect(
      enforceWorkspaceRequest(db, tenant.workspaceId, { ...limit, amount: limit.limit + 1 }),
    ).rejects.toMatchObject({ status: 429 });
    await enforceWorkspaceRequest(db, tenant.workspaceId, { ...limit, amount: limit.limit });
    const deps = dependencies();
    await expect(generate(deps)).rejects.toMatchObject({ status: 429 });
    expect(deps.io.fetch).not.toHaveBeenCalled();
  });
  it('refuses foreign sets before configuring or calling a model', async () => {
    const other = await fixtures.tenant(),
      deps = dependencies();
    await expect(
      generatePrompts(db, other.workspaceId, setId, input(), deps),
    ).rejects.toMatchObject({ status: 404 });
    expect(deps.io.fetch).not.toHaveBeenCalled();
    const config = testConfig();
    const token = await sessionToken({ sub: other.userId, ver: 0 });
    const response = await createApp(config, db).request(`/api/v1/prompt-sets/${setId}/generate`, {
      method: 'POST',
      headers: {
        cookie: `${config.session.cookieName}=${token}`,
        'x-workspace-id': tenant.workspaceId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ count: 2 }),
    });
    expect(response.status).toBe(404);
  });
  it('stages earlier batches when a later batch fails, and fails only with nothing admitted', async () => {
    oneSlotBatches();
    const result = await generatePrompts(
      db,
      tenant.workspaceId,
      setId,
      generationInput.parse({ count: 3 }),
      echoDependencies([3, 4, 5, 6, 7]),
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.shortfall_reason).toBe('model_error');
    const run = await db
      .selectFrom('prompt_generation_runs')
      .select('provenance')
      .where('id', '=', result.candidates[0]!.run_id)
      .executeTakeFirstOrThrow();
    expect(run.provenance).toMatchObject({
      stop_reason: 'model_error',
      model_results: expect.arrayContaining([{ batch: 2, error_code: 'client_error' }]),
    });
    await expect(generate(echoDependencies([1, 2, 3, 4, 5]))).rejects.toMatchObject({
      status: 502,
    });
  });
  it('stops starting batches at the deadline and stages what was admitted', async () => {
    oneSlotBatches();
    const deadline = new AbortController();
    const deps = {
      ...echoDependencies([], (call) => {
        if (call === 1) deadline.abort();
      }),
      deadline: () => deadline.signal,
    };
    const result = await generatePrompts(db, tenant.workspaceId, setId, input(), deps);
    expect(deps.io.fetch).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.shortfall_reason).toBe('deadline');
  });
  it('replays a repeated Idempotency-Key from persisted rows without a model call', async () => {
    const first = await generatePrompts(
      db,
      tenant.workspaceId,
      setId,
      input(),
      echoDependencies(),
      'retry-key',
    );
    const deps = echoDependencies();
    const again = await generatePrompts(db, tenant.workspaceId, setId, input(), deps, 'retry-key');
    expect(deps.io.fetch).not.toHaveBeenCalled();
    expect(again.candidates.map((row) => row.id).toSorted()).toEqual(
      first.candidates.map((row) => row.id).toSorted(),
    );
    expect(again.requested_count).toBe(first.requested_count);
    await expect(
      generatePrompts(
        db,
        tenant.workspaceId,
        setId,
        generationInput.parse({ count: 3 }),
        deps,
        'retry-key',
      ),
    ).rejects.toMatchObject({ status: 409 });
    const other = await fixtures.tenant();
    await expect(
      generatePrompts(db, other.workspaceId, setId, input(), deps, 'retry-key'),
    ).rejects.toMatchObject({ status: 404 });
    expect(deps.io.fetch).not.toHaveBeenCalled();
  });
  it('serializes concurrent staging on the same set and drops newly pending duplicates', async () => {
    const deps = dependencies();
    const results = await Promise.all([generate(deps), generate(deps)]);
    expect(results.reduce((count, result) => count + result.candidates.length, 0)).toBe(2);
    expect(
      await db
        .selectFrom('prompt_generation_runs')
        .select('id')
        .where('prompt_set_id', '=', setId)
        .execute(),
    ).toHaveLength(2);
  });
});
