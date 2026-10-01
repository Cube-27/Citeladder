import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AgentFixtures, catalog, deliverable, scripted } from './agent-support.ts';
import { testDatabase } from './support.ts';
import { agentTools } from '../src/agent/tool-adapters.ts';
import { attachAgentTarget } from '../src/agent/target-adapter.ts';
import { attachOrCreateAction } from '../src/opportunities/actions.ts';
import { readChat } from '../src/agent/reads.ts';

describe('Agent bindings to the evidence and Action owners', () => {
  const db = testDatabase(),
    fixtures = new AgentFixtures(db);
  afterAll(async () => {
    await fixtures.cleanup();
    await db.destroy();
  });
  const signal = () => AbortSignal.timeout(5000);
  it('pins shared MCP reads and fetches to one project and rechecks the member', async () => {
    const scope = await fixtures.scope(),
      foreign = await fixtures.scope();
    const sibling = await fixtures.project(scope.workspaceId);
    const tools = agentTools(db);
    expect(await tools.execute(db, scope, 'list_projects', {}, signal())).toMatchObject({
      status: 'refused',
    });
    expect(await tools.execute(db, scope, 'read_demand', {}, signal())).toMatchObject({
      status: 'unavailable',
      omissions: [{ reason: 'no_demand_snapshot' }],
    });
    expect(
      await tools.execute(db, scope, 'read_demand', { project_id: foreign.projectId }, signal()),
    ).toMatchObject({ status: 'refused' });
    for (const id of [sibling, foreign.projectId]) {
      expect(
        await tools.execute(db, scope, 'fetch', { id: `citeladder://project/${id}` }, signal()),
      ).toMatchObject({ status: 'failed', refs: [] });
    }
    await db
      .deleteFrom('workspace_members')
      .where('workspace_id', '=', scope.workspaceId)
      .where('user_id', '=', scope.userId)
      .execute();
    await expect(tools.execute(db, scope, 'read_demand', {}, signal())).rejects.toMatchObject({
      status: 404,
    });
  });
  it('reads the Action owner and refuses a sibling Action even inside the same workspace', async () => {
    const scope = await fixtures.scope(),
      sibling = await fixtures.project(scope.workspaceId);
    const attach = (projectId: string, topic: string) =>
      db
        .transaction()
        .execute((trx) =>
          attachOrCreateAction(trx, { ...scope, projectId }, 'planned_page', topic, scope.userId),
        );
    const action = await attach(scope.projectId, 'Buyer guide'),
      other = await attach(sibling, 'Other guide');
    const tools = agentTools(db);
    const own = await tools.execute(db, scope, 'get_action', { action_id: action.id }, signal());
    expect(own.status).toBe('completed');
    expect(JSON.parse(own.text).action).toMatchObject({
      id: action.id,
      target_label: 'Buyer guide',
    });
    expect(
      await tools.execute(db, scope, 'get_action', { action_id: other.id }, signal()),
    ).toMatchObject({ status: 'failed' });
    expect(
      JSON.parse((await tools.execute(db, scope, 'list_actions', {}, signal())).text).items,
    ).toHaveLength(1);
  });
  it('attaches concurrent same-target outputs once and preserves invalid-target work', async () => {
    const scope = await fixtures.scope();
    const target = 'https://acme.example/pricing';
    const saved = await Promise.all(
      [0, 1].map(() =>
        db
          .transaction()
          .execute((trx) => attachOrCreateAction(trx, scope, 'page', target, scope.userId)),
      ),
    );
    expect(saved[0]!.id).toBe(saved[1]!.id);
    await expect(
      db
        .transaction()
        .execute((trx) =>
          attachOrCreateAction(
            trx,
            scope,
            'page',
            'https://sub.acme.example/pricing',
            scope.userId,
          ),
        ),
    ).rejects.toThrow('outside');
    const { run, lease } = await fixtures.claimed(scope, { skillId: 'content' });
    await fixtures
      .runtime(
        scope,
        scripted([
          {
            ...deliverable('outline'),
            output: {
              title: 'Guide',
              body: 'Evidence-grounded guide',
              phase: 'outline',
              target_kind: 'planned_page',
              target: 'Buyer guide',
              format_id: randomUUID(),
            },
          },
        ]),
        { attachTarget: attachAgentTarget },
      )
      .execute(lease);
    const chat = await readChat(db, scope, run.chat_id);
    expect(chat.output).toMatchObject({
      target_kind: 'planned_page',
      target_label: 'Buyer guide',
      format_id: null,
    });
    const actionId = chat.output?.action_id;
    expect(actionId).toBeTruthy();
    const next = await fixtures.claimed(scope, { chatId: run.chat_id });
    await fixtures
      .runtime(
        scope,
        scripted([
          {
            ...deliverable('outline'),
            output: {
              title: 'Guide',
              body: 'Revised guide',
              phase: 'outline',
              target_kind: 'page',
              target: 'https://other.test/page',
            },
          },
        ]),
        { attachTarget: attachAgentTarget },
      )
      .execute(next.lease);
    expect((await readChat(db, scope, run.chat_id)).output?.action_id).toBe(actionId);
    const invalid = await fixtures.claimed(scope, { skillId: 'content' });
    await fixtures
      .runtime(
        scope,
        scripted([
          {
            ...deliverable('outline'),
            output: {
              title: 'Guide',
              body: 'Saved for retargeting',
              phase: 'outline',
              target_kind: 'page',
              target: 'https://other.test/page',
            },
          },
        ]),
        { attachTarget: attachAgentTarget },
      )
      .execute(invalid.lease);
    expect((await readChat(db, scope, invalid.run.chat_id)).output).toMatchObject({
      action_id: null,
      latest_revision: { body: 'Saved for retargeting' },
    });
  });
  it('loads only the selected format methodology into a follow-up model request', async () => {
    const scope = await fixtures.scope();
    const formats = new Map([
      ['guide', { id: 'guide', label: 'Guide', body: 'Explain the purchasing decision.' }],
      ['faq', { id: 'faq', label: 'FAQ', body: 'Answer each customer question separately.' }],
    ]);
    const bound = { ...catalog, formats, formatPreamble: 'Use persisted evidence.' };
    const first = await fixtures.claimed(scope, { skillId: 'content' });
    await fixtures
      .runtime(
        scope,
        scripted([
          {
            ...deliverable('outline'),
            output: {
              title: 'Guide',
              body: 'Outline',
              phase: 'outline',
              format_id: 'guide',
            },
          },
        ]),
        { catalog: bound },
      )
      .execute(first.lease);
    const second = await fixtures.claimed(scope, { chatId: first.run.chat_id });
    const model = scripted([deliverable('outline')], async (request) => {
      expect(request.system).toContain(formats.get('guide')!.body);
      expect(request.system).not.toContain(formats.get('faq')!.body);
    });
    await fixtures.runtime(scope, model, { catalog: bound }).execute(second.lease);
    expect((await fixtures.run(second.run.id)).status).toBe('succeeded');
  });
});
