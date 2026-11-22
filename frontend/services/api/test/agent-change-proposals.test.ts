import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { decideProposal } from '../src/agent/proposal-outcomes.ts';
import { readChat } from '../src/agent/reads.ts';
import type { Json, Scope } from '../src/agent/contracts.ts';
import { ApiError } from '../src/errors.ts';
import { AgentFixtures, scripted, text, toolUse } from './agent-support.ts';
import { auditTenant } from './audit-fixtures.ts';
import { topic } from './prompt-fixtures.ts';
import { testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new AgentFixtures(db);

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

async function tenant() {
  const t = await auditTenant(db, fixtures);
  const scope: Scope = { workspaceId: t.workspaceId, projectId: t.projectId, userId: t.userId };
  return { ...t, scope };
}

async function proposed(scope: Scope, calls: { kind: string; payload: Json }[]) {
  const { run, lease } = await fixtures.claimed(scope, { message: 'Please make this change.' });
  await fixtures
    .runtime(
      scope,
      scripted([
        calls.map((call, index) => toolUse('propose_change', call, `call_${index}`)),
        [text('Confirm it below.')],
      ]),
    )
    .execute(lease);
  const chat = await readChat(db, scope, run.chat_id);
  const answer = chat.messages.at(-1)!;
  return { chatId: run.chat_id, messageId: answer.id, proposals: answer.proposals };
}

const promptTexts = async (setId: string) =>
  (
    await db
      .selectFrom('prompts')
      .select('text')
      .where('prompt_set_id', '=', setId)
      .orderBy('created_at')
      .execute()
  ).map((row) => row.text);

const outcome = async (scope: Scope, chatId: string) =>
  (await readChat(db, scope, chatId)).messages.at(-1)!.proposals;

async function status(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof ApiError) return error.status;
    throw error;
  }
}

async function setRole(scope: Scope, role: string) {
  await db
    .updateTable('workspace_members')
    .set({ role })
    .where('user_id', '=', scope.userId)
    .where('workspace_id', '=', scope.workspaceId)
    .execute();
}

it('stages a dry-run proposal that commits with the reply, then executes once for a member of its workspace', async () => {
  const t = await tenant();
  const stranger = await tenant();
  const added = 'Which trail shoes grip best?';
  const { chatId, messageId, proposals } = await proposed(t.scope, [
    { kind: 'add_prompts', payload: { prompt_set_id: t.setId, prompts: [] } },
    { kind: 'add_prompts', payload: { prompt_set_id: t.setId, prompts: [{ text: added }] } },
  ]);
  expect(proposals).toEqual([
    {
      kind: 'change',
      index: 0,
      title: 'Add 1 prompt to “Set”',
      rows: [{ label: 'Prompt', value: added }],
      spend: null,
      opens: null,
      outcome: 'open',
    },
  ]);
  expect(await promptTexts(t.setId)).toEqual(['Which running shoes suit road use?']);

  const ref = { chatId, messageId, index: 0 };
  const decide = (scope: Pick<Scope, 'workspaceId' | 'userId'>) =>
    status(decideProposal(db, config, { scope, ref, decision: 'confirm' }));
  expect(await decide(stranger.scope)).toBe(404);
  expect(await decide({ workspaceId: t.workspaceId, userId: stranger.userId })).toBe(404);
  await setRole(t.scope, 'viewer');
  expect(await decide(t.scope)).toBe(403);
  await setRole(t.scope, 'member');
  expect(await outcome(t.scope, chatId)).toMatchObject([{ outcome: 'open' }]);

  expect((await Promise.all([decide(t.scope), decide(t.scope)])).sort()).toEqual([200, 409]);
  expect(await promptTexts(t.setId)).toEqual(['Which running shoes suit road use?', added]);
  expect(await outcome(t.scope, chatId)).toMatchObject([{ outcome: 'executed' }]);
  expect(
    await db
      .selectFrom('security_events')
      .select(['event', 'target_id'])
      .where('actor_id', '=', t.userId)
      .where('event', 'like', 'agent.change.%')
      .execute(),
  ).toEqual([{ event: 'agent.change.add_prompts', target_id: t.projectId }]);
});

it('returns the owner’s error when the world changed and leaves the card confirmable', async () => {
  const t = await tenant();
  const { chatId, messageId } = await proposed(t.scope, [
    { kind: 'create_topic', payload: { name: 'Trail' } },
  ]);
  const clash = await topic(db, t.projectId, 'Trail');
  const ref = { chatId, messageId, index: 0 };
  const confirm = () => decideProposal(db, config, { scope: t.scope, ref, decision: 'confirm' });
  expect(await status(confirm())).toBe(409);
  expect(await outcome(t.scope, chatId)).toMatchObject([{ outcome: 'open' }]);
  await db.deleteFrom('topics').where('id', '=', clash).execute();
  expect(await status(confirm())).toBe(200);
  expect(await outcome(t.scope, chatId)).toMatchObject([{ outcome: 'executed' }]);
});

it('previews a paid launch with its spend and holds nothing until the click', async () => {
  const t = await tenant();
  const ledger = () =>
    db
      .selectFrom('consumable_ledger')
      .select('id')
      .where('workspace_id', '=', t.workspaceId)
      .execute();
  const audits = () =>
    db.selectFrom('audits').select('status').where('project_id', '=', t.projectId).execute();
  const before = await ledger();
  const { chatId, messageId, proposals } = await proposed(t.scope, [
    {
      kind: 'launch_audit',
      payload: { request: { prompt_set_id: t.setId, engines: ['chatgpt'] } },
    },
  ]);
  expect(proposals).toMatchObject([
    {
      title: 'Launch an audit',
      spend: expect.stringMatching(/^Up to 1 prompt run, in at most \d+ provider attempts?$/u),
      opens: { label: 'Open Runs', path: '/runs' },
    },
  ]);
  expect(await audits()).toEqual([]);
  expect(await ledger()).toEqual(before);

  await decideProposal(db, config, {
    scope: t.scope,
    ref: { chatId, messageId, index: 0 },
    decision: 'confirm',
  });
  expect(await audits()).toEqual([{ status: 'queued' }]);
});

it('dismisses a card without changing anything and refuses to execute it afterwards', async () => {
  const t = await tenant();
  const name = `Trail ${randomUUID().slice(0, 4)}`;
  const { chatId, messageId } = await proposed(t.scope, [
    { kind: 'create_topic', payload: { name } },
  ]);
  const ref = { chatId, messageId, index: 0 };
  await decideProposal(db, config, { scope: t.scope, ref, decision: 'dismiss' });
  expect(
    await status(decideProposal(db, config, { scope: t.scope, ref, decision: 'confirm' })),
  ).toBe(409);
  expect(await outcome(t.scope, chatId)).toMatchObject([{ outcome: 'dismissed' }]);
  expect(
    await db.selectFrom('topics').select('name').where('project_id', '=', t.projectId).execute(),
  ).toEqual([]);
});
