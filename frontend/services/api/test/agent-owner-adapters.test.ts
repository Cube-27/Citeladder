import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as sharedTools from '../src/mcp/tools.ts';
import { AgentFixtures, agentPolicy, catalog, deliverable, scripted } from './agent-support.ts';
import { testDatabase } from './support.ts';
import { agentTools } from '../src/agent/tool-adapters.ts';
import { attachAgentTarget } from '../src/agent/target-adapter.ts';
import { attachOrCreateAction } from '../src/opportunities/actions.ts';
import { readChat } from '../src/agent/reads.ts';
import { loadSkillCatalog } from '../src/agent/skills.ts';
import { agentSettings } from '../src/agent/config.ts';
import { AgentQueue } from '../src/agent/queue.ts';
import { AgentOutputs } from '../src/agent/outputs.ts';
import { readAgentContext } from '../src/agent/context-adapter.ts';
import { SiteFixtures } from './site-health-fixtures.ts';

describe('Agent bindings to the evidence and Action owners', () => {
  const db = testDatabase(),
    fixtures = new AgentFixtures(db);
  afterAll(async () => {
    await fixtures.cleanup();
    await db.destroy();
  });
  const signal = () => AbortSignal.timeout(5000);
  it('sizes page reads to the turn budget while retaining owner cursors and every row', async () => {
    const site = new SiteFixtures(db);
    try {
      const scope = await site.crawl();
      const expected = [];
      for (let index = 0; index < 12; index++) {
        expected.push(
          (
            await site.page(
              scope,
              `/page-${index}`,
              { title: 'Title '.repeat(50) },
              { observed: true },
            )
          ).id,
        );
      }
      const tools = agentTools(db);
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const outcome = await tools.execute(
          db,
          scope,
          'read_site_pages',
          { crawl_id: scope.crawlId, limit: 100, cursor },
          signal(),
          5000,
        );
        expect(outcome.status).toBe('completed');
        expect(outcome.omissions).toEqual([]);
        const page = JSON.parse(outcome.text);
        expect(page.items.length).toBeGreaterThan(0);
        seen.push(...page.items.map((item: { site_url_id: string }) => item.site_url_id));
        cursor = page.pagination.next_cursor;
      } while (cursor && seen.length <= expected.length);
      expect(seen.sort()).toEqual(expected.sort());
    } finally {
      await site.cleanup();
    }
  });
  it('offers every read tool the packaged methodologies name, and no project picker or MCP App view', async () => {
    const packaged = await loadSkillCatalog(agentSettings({}).skillsDirectory);
    const named = new Set(
      [packaged.operatingContract, ...[...packaged.skills.values()].map((skill) => skill.body)]
        .flatMap((body) => [...body.matchAll(/`((?:read|list|get)_[a-z_]+)`/gu)])
        .map((match) => match[1]!),
    );
    const offered = agentTools(db);
    expect(named.size).toBeGreaterThan(0);
    expect([...named].filter((name) => !offered.has(name))).toEqual([]);
    const chatOnly = ['list_projects', 'render_visibility', 'render_site_health', 'open_analytics'];
    expect(chatOnly.filter((name) => offered.has(name))).toEqual([]);
  });
  it('pins shared MCP reads and fetches to one project and rechecks the member', async () => {
    const scope = await fixtures.scope(),
      foreign = await fixtures.scope();
    const sibling = await fixtures.project(scope.workspaceId);
    const tools = agentTools(db);
    const fetched = await tools.execute(
      db,
      scope,
      'fetch',
      { id: `citeladder://project/${scope.projectId}` },
      signal(),
    );
    expect(fetched.status).toBe('completed');
    expect(fetched.refs).toEqual([
      { id: scope.projectId, record_uri: `citeladder://project/${scope.projectId}` },
    ]);
    expect(JSON.parse(fetched.text).metadata.project_id).toBe(scope.projectId);
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
  it('fails unknown reader availability while preserving observed zero and stateless search results', async () => {
    const scope = await fixtures.scope();
    const tools = agentTools(db);
    const read = vi.spyOn(sharedTools, 'dispatchTool');
    try {
      for (const state of [undefined, 'unexpected']) {
        read.mockResolvedValueOnce(state === undefined ? {} : { state });
        expect(await tools.execute(db, scope, 'read_demand', {}, signal())).toMatchObject({
          status: 'failed',
        });
      }
      read.mockResolvedValueOnce({ state: 'available', artifact_refs: [{ wrong: 'malformed' }] });
      expect(await tools.execute(db, scope, 'read_demand', {}, signal())).toMatchObject({
        status: 'failed',
      });
      read.mockResolvedValueOnce({ state: 'observed_zero', items: [] });
      const zero = await tools.execute(
        db,
        scope,
        'read_query_evidence',
        { window_start: '2026-09-01', window_end: '2026-09-02' },
        signal(),
      );
      expect(zero.status).toBe('completed');
      expect(JSON.parse(zero.text).state).toBe('observed_zero');
      read.mockResolvedValueOnce({ results: [] });
      expect(
        await tools.execute(db, scope, 'search', { query: 'Nothing' }, signal()),
      ).toMatchObject({ status: 'completed' });
    } finally {
      read.mockRestore();
    }
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
  it('offers earlier reads as re-read hints and lists only this turn’s reads as sources', async () => {
    const scope = await fixtures.scope();
    const tools = agentTools(db);
    const store = fixtures.store({ registryVersion: tools.version });
    const queue = new AgentQueue(db, 30);
    const uri = `citeladder://project/${scope.projectId}`;
    const fetch = {
      action: 'call_tool',
      tool: 'fetch',
      arguments_json: JSON.stringify({ id: uri }),
    };
    const answer = { action: 'respond', reply: `Project evidence ${uri}` };
    const first = await store.enqueue(scope, { key: randomUUID(), message: 'Explain project' });
    const execute = async (steps: unknown[], inspect?: Parameters<typeof scripted>[1]) => {
      const claimed = await queue.claim('evidence-continuity', [scope.workspaceId]);
      const lease = await queue.start(claimed!, 'evidence-continuity');
      await fixtures.runtime(scope, scripted(steps, inspect), { tools }).execute(lease);
      return readChat(db, scope, first.chat_id);
    };
    expect((await execute([fetch, answer])).messages.at(-1)?.evidence_refs).toEqual([uri]);
    const attempt = await db
      .selectFrom('agent_tool_attempts')
      .selectAll()
      .where('run_id', '=', first.id)
      .executeTakeFirstOrThrow();
    const failedUri = `citeladder://project/${randomUUID()}`;
    await db
      .insertInto('agent_tool_attempts')
      .values(
        Array.from({ length: agentPolicy.prior_evidence_max_refs + 1 }, (_, index) => ({
          ...attempt,
          id: randomUUID(),
          ordinal: index + 2,
          input: {},
          omissions: '[]',
          status: index === 0 ? 'failed' : 'completed',
          artifact_refs: JSON.stringify(index === 0 ? [{ record_uri: failedUri }] : []),
          created_at: new Date(attempt.created_at.getTime() + index + 1),
        })),
      )
      .execute();
    await store.enqueue(scope, { key: randomUUID(), chatId: first.chat_id, message: 'Follow up' });
    const withoutRead = await execute([answer], async (request) => {
      expect(request.system).toContain(uri);
      expect(request.system).not.toContain(failedUri);
      expect(JSON.parse(request.user).observations).toEqual([]);
    });
    expect(withoutRead.messages.at(-1)?.evidence_refs).toEqual([]);
    expect(withoutRead.messages.at(-1)?.content).toBe('Project evidence');
    await store.enqueue(scope, {
      key: randomUUID(),
      chatId: first.chat_id,
      message: 'Read it again',
    });
    const refreshed = await execute([fetch, answer]);
    expect(refreshed.messages.at(-1)?.evidence_refs).toEqual([uri]);
    expect(refreshed.latest_run?.progress.filter((step) => step.tool === 'fetch')).toHaveLength(1);
  });
  it('carries an Action through outline approval, user edit, refinement and an exact next-step revision', async () => {
    const scope = await fixtures.scope();
    const action = await db
      .transaction()
      .execute((trx) =>
        attachOrCreateAction(trx, scope, 'planned_page', 'Buyer guide', scope.userId),
      );
    const tools = agentTools(db);
    const store = fixtures.store({ registryVersion: tools.version, context: readAgentContext });
    const queue = new AgentQueue(db, 30);
    const execute = async (steps: unknown[], inspect?: Parameters<typeof scripted>[1]) => {
      const claimed = await queue.claim('workflow-acceptance', [scope.workspaceId]);
      const lease = await queue.start(claimed!, 'workflow-acceptance');
      await fixtures.runtime(scope, scripted(steps, inspect), { tools }).execute(lease);
      return readChat(db, scope, claimed!.chat_id);
    };
    const first = await store.enqueue(scope, {
      key: randomUUID(),
      actionId: action.id,
      skillId: 'content',
      message: 'Write a buyer guide',
    });
    const outlined = await execute([deliverable('draft', 'Proposed outline')], async (request) => {
      expect(JSON.parse(request.user).context.action.id).toBe(action.id);
    });
    const outline = outlined.output!.latest_revision!;
    expect(outline.phase).toBe('outline');
    await store.approveOutline(scope, first.chat_id, outline.id, randomUUID());
    const drafted = await execute([deliverable('draft', 'Approved draft')]);
    const edited = await new AgentOutputs(db).edit(
      scope,
      first.chat_id,
      drafted.output!.latest_revision!.id,
      'Buyer guide',
      'User edited draft',
    );
    expect((await readChat(db, scope, first.chat_id)).output?.message_id).toBe(
      drafted.messages.at(-1)!.id,
    );
    await store.enqueue(scope, {
      key: randomUUID(),
      chatId: first.chat_id,
      message: 'Refine my edit',
    });
    const refined = await execute(
      [deliverable('draft', 'Refined accepted guide')],
      async (request) => {
        expect(JSON.parse(request.user).current_revision).toMatchObject({
          id: edited.id,
          body: 'User edited draft',
        });
      },
    );
    const accepted = refined.output!.latest_revision!;
    expect(accepted.parent_revision_id).toBe(edited.id);
    expect(refined.output!.message_id).toBe(refined.messages.at(-1)!.id);
    await store.enqueue(scope, {
      key: randomUUID(),
      message: 'Plan distribution',
      skillId: 'plan',
      refs: {
        output_revision_reference: { output_id: refined.output!.id, revision_id: accepted.id },
      },
    });
    const next = await execute([deliverable('final', 'Distribution plan')], async (request) => {
      expect(JSON.parse(request.user).context.package.sections.upstream_revision).toMatchObject({
        id: accepted.id,
        body: 'Refined accepted guide',
      });
    });
    expect(next.output?.kind).toBe('plan');
    expect(next.chat.id).not.toBe(first.chat_id);
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
      [
        'guide',
        { id: 'guide', label: 'Guide', body: 'Explain the purchasing decision.', longForm: true },
      ],
      [
        'faq',
        {
          id: 'faq',
          label: 'FAQ',
          body: 'Answer each customer question separately.',
          longForm: false,
        },
      ],
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
