import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { enforceWorkspaceRequest, agentCallLimit } from '../src/abuse/usage.ts';
import { policy } from '../src/config.ts';
import { createApp } from '../src/app.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { createJevClient, jevSettings } from '../src/models/jev.ts';
import { reviewCandidates } from '../src/prompts/candidates.ts';
import { generationInput } from '../src/prompts/generation-input.ts';
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
const input = () => generationInput.parse({ count: 2 });
const generate = (deps = dependencies()) =>
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
          '```json\n' +
          JSON.stringify({
            prompts: [
              {
                topic_id: selected.id,
                text: 'Which running shoes cushion knees?',
                buyer_stage: 'consideration',
                prompt_intent: 'recommend',
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
    expect(deps.io.fetch).not.toHaveBeenCalled();
    const run = await db
      .selectFrom('prompt_generation_runs')
      .select('provenance')
      .where('id', '=', result.candidates[0]!.run_id)
      .executeTakeFirstOrThrow();
    expect(run.provenance).toMatchObject({
      agent_revision_id: revisionId,
      agent_output_id: outputId,
    });
    expect(
      (await generatePrompts(db, tenant.workspaceId, setId, request, deps)).candidates,
    ).toEqual([]);
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
