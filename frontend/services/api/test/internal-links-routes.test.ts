import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { internalLinksReadSchema } from '@citeladder/contracts/site-health';

import { createApp } from '../src/app.ts';
import { actionFixture, type ActionSeed } from './action-support.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { record } from '../src/db/json.ts';
import { publishInternalLinks } from '../src/site-health/internal-link-publish.ts';
import { recomputeOpportunities } from '../src/opportunities/refresh.ts';
import type { LinkCandidate } from '../src/site-health/internal-link-candidates.ts';
import { enqueueTask } from '../src/referrals/enqueue.ts';

const config = testConfig();
const db = testDatabase(config);
const app = createApp(config, db);
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const seeds: ActionSeed[] = [];
async function request(seed: ActionSeed, suffix = '', body?: unknown) {
  return app.request(`/api/v1/projects/${seed.project_id}/site-health/internal-links${suffix}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: `${config.session.cookieName}=${await sessionToken({ sub: seed.user_id, ver: 0 })}`,
      'x-workspace-id': seed.workspace_id,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
afterAll(async () => {
  for (const seed of seeds) {
    await db.deleteFrom('workspaces').where('id', '=', seed.workspace_id).execute();
    await db.deleteFrom('users').where('id', '=', seed.user_id).execute();
  }
  await db.destroy();
});

describe('internal link analysis admission', () => {
  it('publishes frozen links into page Actions and declares the explicit selection with the other page findings', async () => {
    const seed = await actionFixture<ActionSeed>('content');
    seeds.push(seed);
    const admitted = internalLinksReadSchema.parse(
      await (
        await request(seed, '/analyses', {
          crawl_id: seed.crawl_id,
          idempotency_key: randomUUID(),
        })
      ).json(),
    );
    const runId = admitted.analysis!.id;
    const run = await db
      .selectFrom('site_internal_link_runs')
      .selectAll()
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    const candidates = record(run.manifest).candidates as LinkCandidate[];
    const source = candidates[0]!.source;
    const selected = candidates.filter((candidate) => candidate.source === source);
    expect(selected.length).toBeGreaterThan(1);
    for (const candidate of selected) {
      await db
        .insertInto('site_internal_link_events')
        .values({
          id: randomUUID(),
          workspace_id: seed.workspace_id,
          project_id: seed.project_id,
          run_id: runId,
          candidate_id: candidate.id,
          kind: 'outcome',
          created_at: new Date(),
          evidence: JSON.stringify({
            state: 'completed',
            answers: {
              link: { type: 'noul', noul: 0.99 },
              anchor: { type: 'choice', choice: 'a0', confidence: 0.95 },
            },
          }),
        })
        .execute();
    }
    await enqueueTask(db, {
      workspaceId: seed.workspace_id,
      projectId: seed.project_id,
      kind: 'internal_link_publish',
      payload: { run_id: runId },
      keyParts: [runId],
      maxAttempts: 2,
    });
    const task = await db
      .updateTable('analytics_tasks')
      .set({
        status: 'running',
        lease_owner: 'fixture',
        lease_expires_at: new Date(Date.now() + 60_000),
      })
      .where('workspace_id', '=', seed.workspace_id)
      .where('task_kind', '=', 'internal_link_publish')
      .returningAll()
      .executeTakeFirstOrThrow();
    await publishInternalLinks(task, { db, checkCancelled: async () => {}, maxAttempts: 2 });
    const progress = internalLinksReadSchema.parse(await (await request(seed)).json());
    expect(progress.analysis!.state).toBe('running');
    expect(progress.analysis!.recommendations.length).toBeGreaterThan(0);
    expect(progress.analysis!.diagnostics!.pending).toBeGreaterThan(0);
    const selectedIds = new Set(selected.map((candidate) => candidate.id));
    const remaining = (record(run.manifest).candidates as { id: string }[]).filter(
      (candidate) => !selectedIds.has(candidate.id),
    );
    await db
      .insertInto('site_internal_link_events')
      .values(
        remaining.map((candidate) => ({
          id: randomUUID(),
          workspace_id: seed.workspace_id,
          project_id: seed.project_id,
          run_id: runId,
          candidate_id: candidate.id,
          kind: 'outcome',
          created_at: new Date(),
          evidence: JSON.stringify({ state: 'unavailable', reason: 'deadline_exceeded' }),
        })),
      )
      .execute();
    await publishInternalLinks(task, { db, checkCancelled: async () => {}, maxAttempts: 2 });
    await recomputeOpportunities(
      db,
      { workspaceId: seed.workspace_id, projectId: seed.project_id },
      { skipIfCurrent: true },
    );
    const result = internalLinksReadSchema.parse(await (await request(seed)).json());
    const link = result.analysis!.recommendations.find((item) => item.id === selected[0]!.id)!;
    expect(link.action_id).not.toBeNull();
    const contextualMember = await db
      .selectFrom('opportunities')
      .selectAll()
      .where('action_id', '=', link.action_id!)
      .where('rule_id', '=', 'site_contextual_links')
      .where('superseded_at', 'is', null)
      .executeTakeFirstOrThrow();
    await db
      .insertInto('opportunities')
      .values({
        ...contextualMember,
        id: randomUUID(),
        rule_id: 'missing_structured_data',
        target_key: 'fixture:unrelated',
        evidence: JSON.stringify({ site_url_id: link.source.site_url_id }),
        source_analysis_ids: JSON.stringify([]),
        source_issue_ids: JSON.stringify([]),
        source_metric_ids: JSON.stringify([]),
      })
      .execute();
    const key = randomUUID();
    const declare = (ids: string[]) =>
      app.request(`/api/v1/actions/${link.action_id}/declaration`, {
        method: 'POST',
        headers: {
          cookie: `${config.session.cookieName}=${token}`,
          'x-workspace-id': seed.workspace_id,
          'content-type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          declared_implemented_at: '2026-09-28T10:00:00Z',
          recommendation_ids: ids,
        }),
      });
    const token = await sessionToken({ sub: seed.user_id, ver: 0 });
    expect((await declare([randomUUID()])).status).toBe(409);
    const declaration = await declare([link.id]);
    expect(declaration.status).toBe(201);
    const saved = await db
      .selectFrom('opportunity_implementation_events')
      .select(['expected_checks', 'member_opportunity_ids'])
      .where('action_id', '=', link.action_id!)
      .executeTakeFirstOrThrow();
    const checks = saved.expected_checks as Record<string, unknown>[];
    expect(checks.filter((check) => check.kind === 'contextual_link')).toEqual([
      expect.objectContaining({ recommendation_id: link.id }),
    ]);
    expect(checks.some((check) => check.kind !== 'contextual_link')).toBe(true);
    const declaredMembers = saved.member_opportunity_ids as string[];
    expect(declaredMembers).toContain(contextualMember.id);
    expect(declaredMembers.length).toBeGreaterThan(1);
    expect((await declare([link.id])).status).toBe(200);
    expect((await declare(selected.map((candidate) => candidate.id))).status).toBe(409);
  });
  it('replays concurrent requests, isolates manifests, and cancels without changing crawl evidence', async () => {
    const seed = await actionFixture<ActionSeed>('content');
    seeds.push(seed);
    const input = { crawl_id: seed.crawl_id, idempotency_key: randomUUID() };
    const replies = await Promise.all([
      request(seed, '/analyses', input),
      request(seed, '/analyses', input),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([202, 202]);
    const [first, replay] = await Promise.all(
      replies.map(async (reply) => internalLinksReadSchema.parse(await reply.json())),
    );
    expect(first!.analysis!.id).toBe(replay!.analysis!.id);
    expect((await request(seed, '/analyses', { ...input, crawl_id: randomUUID() })).status).toBe(
      409,
    );
    expect(
      (await request(seed, '/analyses', { ...input, idempotency_key: randomUUID() })).status,
    ).toBe(409);
    const other = await actionFixture<ActionSeed>('content');
    seeds.push(other);
    expect((await request(other, `?analysis_id=${first!.analysis!.id}`)).status).toBe(404);
    const cancelled = await request(seed, `/analyses/${first!.analysis!.id}/cancel`, {});
    expect(internalLinksReadSchema.parse(await cancelled.json()).analysis?.state).toBe('cancelled');
    const saved = await db
      .selectFrom('site_internal_link_runs')
      .select('manifest')
      .where('id', '=', first!.analysis!.id)
      .executeTakeFirstOrThrow();
    expect(saved.manifest).toMatchObject({ page_count: 3 });
  });
});
