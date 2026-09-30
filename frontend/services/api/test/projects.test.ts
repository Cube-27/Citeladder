import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { projectSchema } from '@citeladder/contracts/project';
import { projectCreate, projectUpdate } from '../src/projects/inputs.ts';
import {
  createProject,
  readProject,
  updateProject,
  deleteProject,
} from '../src/projects/service.ts';
import { commandCenter } from '../src/projects/command-center.ts';
import { billingAccount, grant, prompt, promptSet } from './prompt-fixtures.ts';
import { Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

describe('project owner', () => {
  const db = testDatabase();
  const fixtures = new Fixtures(db);
  const measurements = new VisibilityFixtures(db);
  const ledgerIds: string[] = [];
  afterAll(async () => {
    if (ledgerIds.length)
      await db.deleteFrom('consumable_ledger').where('id', 'in', ledgerIds).execute();
    await measurements.cleanup();
    await fixtures.cleanup();
    await db.destroy();
  });
  async function tenant() {
    const userId = await fixtures.user();
    const workspaceId = await fixtures.ownedWorkspace(userId);
    const accountId = await billingAccount(db, workspaceId);
    return { userId, workspaceId, accountId };
  }
  it('serializes concurrent creates against capacity and isolates another account', async () => {
    const a = await tenant();
    const b = await tenant();
    await grant(db, a.accountId, { key: 'project_slots', value: 1 });
    const results = await Promise.allSettled(
      ['Alpha', 'Beta'].map((name) =>
        createProject(db, a.workspaceId, a.userId, projectCreate.parse({ name })),
      ),
    );
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((item) => item.status === 'rejected');
    expect(failure).toMatchObject({
      status: 'rejected',
      reason: { status: 403, code: 'occupancy_limit_exceeded' },
    });
    await expect(
      createProject(db, b.workspaceId, b.userId, projectCreate.parse({ name: 'Independent' })),
    ).resolves.toMatchObject({ name: 'Independent' });
    await grant(db, a.accountId, { key: 'project_slots', value: 1 });
    await expect(
      createProject(db, a.workspaceId, a.userId, projectCreate.parse({ name: 'New grant' })),
    ).resolves.toMatchObject({ name: 'New grant' });
  });
  it('fails closed for absent and corrupt account grants', async () => {
    const user = await fixtures.user();
    const workspace = await fixtures.ownedWorkspace(user);
    await expect(
      createProject(db, workspace, user, projectCreate.parse({ name: 'Missing' })),
    ).rejects.toMatchObject({ code: 'occupancy_unresolved' });
    const account = await billingAccount(db, workspace);
    await grant(db, account, { key: 'unknown', value: 1 });
    await expect(
      createProject(db, workspace, user, projectCreate.parse({ name: 'Corrupt' })),
    ).rejects.toMatchObject({ code: 'occupancy_unresolved' });
  });
  it('persists identity and provenance, updates collections atomically and remaps market', async () => {
    const t = await tenant();
    const created = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({
        name: 'Acme',
        brand_name: 'Acme',
        brand: { aliases: [' ACME ', 'Acme'] },
        country_code: 'IN',
        language_code: 'en',
        owned_domains: ['acme.com'],
        description: ' Reviewed description ',
        products_services: ['Analytics', 'analytics', ' '],
        competitors: [{ name: 'Globex', domains: ['globex.com'] }],
      }),
    );
    const scope = { workspaceId: t.workspaceId, projectId: created.id };
    expect(projectSchema.parse(created)).toMatchObject({
      brand: { aliases: ['ACME'] },
      owned_domains: ['acme.com'],
    });
    const profile = await db
      .selectFrom('brand_profiles')
      .selectAll()
      .where('project_id', '=', created.id)
      .executeTakeFirstOrThrow();
    expect(profile.sources).toMatchObject({
      description: { origin: 'manual', review_state: 'confirmed', reviewed_by: t.userId },
    });
    expect(profile.products_services).toEqual(['Analytics']);
    const changed = await updateProject(
      db,
      scope,
      projectUpdate.parse({
        brand_name: 'New Acme',
        brand: { aliases: [] },
        country_code: 'GLOBAL',
        competitors: [],
        unintended_domains: ['unrelated.com'],
      }),
    );
    expect(changed).toMatchObject({
      brand_name: 'New Acme',
      brand: { aliases: [] },
      competitors: [],
      unintended_domains: ['unrelated.com'],
    });
    expect(
      await db
        .selectFrom('projects')
        .select('serp_location_code')
        .where('id', '=', created.id)
        .executeTakeFirst(),
    ).toEqual({ serp_location_code: 0 });
    await expect(readProject(db, { ...scope, workspaceId: randomUUID() })).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteProject(db, scope)).rejects.toMatchObject({
      code: 'capability_not_granted',
    });
    await grant(db, t.accountId, { key: 'project_deletion', value: 1 });
    await deleteProject(db, scope);
    await expect(readProject(db, scope)).rejects.toMatchObject({ status: 404 });
  });
  it('resolves project links through membership and keeps viewers read only', async () => {
    const t = await tenant();
    const project = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({ name: 'Linked' }),
    );
    const viewer = await fixtures.user();
    await fixtures.member(t.workspaceId, viewer, 'viewer');
    const other = await tenant();
    const app = createApp(testConfig(), db);
    const headers = {
      cookie: `${testConfig().session.cookieName}=${await sessionToken({ sub: viewer, ver: 0 })}`,
      'X-Workspace-Id': other.workspaceId,
    };
    const response = await app.request(`/api/v1/projects/${project.id}`, { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ workspace_id: t.workspaceId });
    const denied = await app.request(`/api/v1/projects/${project.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'X-Workspace-Id': t.workspaceId },
      body: JSON.stringify({ name: 'No' }),
    });
    expect(denied.status).toBe(403);
    const foreign = await app.request(`/api/v1/projects/${project.id}`, {
      headers: {
        cookie: `${testConfig().session.cookieName}=${await sessionToken({ sub: other.userId, ver: 0 })}`,
      },
    });
    expect(foreign.status).toBe(404);
  });
  it.each(['admin', 'member', 'viewer'] as const)(
    'admits project creation by workspace write capability for %s',
    async (role) => {
      const t = await tenant();
      const user = await fixtures.user();
      await fixtures.member(t.workspaceId, user, role);
      const headers = {
        cookie: `${testConfig().session.cookieName}=${await sessionToken({ sub: user, ver: 0 })}`,
        'X-Workspace-Id': t.workspaceId,
      };
      const response = await createApp(testConfig(), db).request('/api/v1/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Role project' }),
      });
      expect(response.status).toBe(role === 'viewer' ? 403 : 201);
    },
  );
  it('lists only projects in the authorized workspace and rejects anonymous access', async () => {
    const a = await tenant();
    const b = await tenant();
    const project = await createProject(
      db,
      a.workspaceId,
      a.userId,
      projectCreate.parse({ name: 'Mine' }),
    );
    await createProject(db, b.workspaceId, b.userId, projectCreate.parse({ name: 'Foreign' }));
    const app = createApp(testConfig(), db);
    const response = await app.request('/api/v1/projects', {
      headers: {
        cookie: `${testConfig().session.cookieName}=${await sessionToken({ sub: a.userId, ver: 0 })}`,
        'X-Workspace-Id': a.workspaceId,
      },
    });
    expect(((await response.json()) as { id: string }[]).map((row) => row.id)).toEqual([
      project.id,
    ]);
    expect((await app.request('/api/v1/projects')).status).toBe(401);
  });
  it('keeps immutable audit evidence when deletion is requested', async () => {
    const t = await measurements.tenant();
    await db
      .updateTable('projects')
      .set({ benchmark_mode: 'consumer_like' })
      .where('id', '=', t.projectId)
      .execute();
    const account = await billingAccount(db, t.workspaceId);
    await grant(db, account, { key: 'project_deletion', value: 1 });
    const audit = await measurements.audit(t);
    const { taskId } = await measurements.execution(t, { auditId: audit });
    const grantId = await grant(db, account, { key: 'audit_credits', value: 1 });
    const ledgerId = randomUUID();
    ledgerIds.push(ledgerId);
    await db
      .insertInto('consumable_ledger')
      .values({
        id: ledgerId,
        billing_account_id: account,
        grant_id: grantId,
        capability_key: 'audit_credits',
        entry_kind: 'reservation',
        reservation_id: randomUUID(),
        subject_kind: 'audit',
        subject_id: audit,
        workspace_id: t.workspaceId,
        audit_id: audit,
        task_id: taskId,
        agent_run_id: null,
        site_crawl_id: null,
        dispatch_key: '',
        request_fingerprint: '',
        allocation_order: 0,
        refund_of_id: null,
        attempt: null,
        units: 1,
        idempotency_key: ledgerId,
        created_at: new Date(),
      })
      .execute();
    await expect(
      deleteProject(db, { workspaceId: t.workspaceId, projectId: t.projectId }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.selectFrom('audits').select('id').where('id', '=', audit).executeTakeFirst(),
    ).toEqual({ id: audit });
  });
  it('overview reads persisted state and counts only enabled active prompts', async () => {
    const t = await tenant();
    const project = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({ name: 'Overview' }),
    );
    const set = await promptSet(db, project.id);
    const active = await prompt(db, set, 'Which service?');
    const disabled = await prompt(db, set, 'Which vendor?');
    await db.updateTable('prompts').set({ enabled: false }).where('id', '=', disabled).execute();
    const view = await commandCenter(
      db,
      { workspaceId: t.workspaceId, projectId: project.id },
      null,
    );
    expect(view).toMatchObject({
      active_prompt_count: 1,
      next_action: { kind: 'connect' },
      report_available: false,
      loop: { tracked: { state: 'not_run' } },
      state: { visibility: { value: null, delta: null } },
    });
    expect(active).toBeTruthy();
    await expect(
      commandCenter(db, { workspaceId: t.workspaceId, projectId: project.id }, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('overview compares frozen measurements and keeps unknown metrics distinct from observed zero', async () => {
    const t = await measurements.tenant();
    await db
      .updateTable('projects')
      .set({ benchmark_mode: 'consumer_like' })
      .where('id', '=', t.projectId)
      .execute();
    await measurements.brand(t.projectId, 'Acme Corp');
    const configuration = {
      brand_name: 'Acme Corp',
      brand_aliases: [],
      owned_domains: ['acme.example'],
      competitors: [],
      country_code: 'US',
      language_code: 'en',
      benchmark_mode: 'consumer_like',
      panel_hash: 'panel-1',
      engine_routes: { chatgpt: { transport_provider: 'test', transport_model: 'test' } },
      measurement_policy: {
        retrieval_enabled: true,
        max_output_tokens: 1000,
        answer_instruction: '',
      },
    };
    async function measured(at: string, count: number, score: number, config = configuration) {
      const id = await measurements.audit(t, { completedAt: new Date(at), configuration: config });
      const aggregate = {
        total_completed: 2,
        brand_mention_count: count,
        owned_citation_response_count: 0,
        brand_mention_rate: count / 2,
        owned_citation_rate: 0,
        competitor_mention_rate: {},
        competitor_citation_rate: {},
        share_of_voice: { mention_counts: { 'Acme Corp': count } },
        coverage: { requested: 2, failed: 0, not_run: 0 },
      };
      await measurements.metricSnapshot(t, id, {
        metrics: { ...aggregate, per_engine: { chatgpt: aggregate } },
        visibilityScore: score,
      });
      return id;
    }
    const baseline = await measured('2026-03-01T00:00:00Z', 0, 0);
    await measured('2026-03-02T00:00:00Z', 1, 20, {
      ...configuration,
      panel_hash: 'different-panel',
    });
    const current = await measured('2026-03-03T00:00:00Z', 2, 40);
    const view = await commandCenter(db, t, null);
    expect(view).toMatchObject({
      measurement: { audit_id: current, comparable_audit_id: baseline },
      state: { visibility: { value: 40, delta: 40 } },
      track: { citation_share: { value: 0, delta: 0 } },
      report_available: true,
    });
    expect((await commandCenter(db, t, baseline)).state.visibility).toEqual({
      value: 0,
      delta: null,
    });
    await expect(
      commandCenter(db, { ...t, workspaceId: randomUUID() }, null),
    ).rejects.toMatchObject({ status: 404 });
  });
});
