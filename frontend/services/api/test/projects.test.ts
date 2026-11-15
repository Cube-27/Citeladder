import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.ts';
import { projectSchema } from '@citeladder/contracts/project';
import { projectCreate, projectUpdate } from '../src/projects/inputs.ts';
import {
  createProject,
  readProject,
  updateProject,
  deleteProject,
  removeProject,
} from '../src/projects/service.ts';
import { hold } from '../src/entitlements/ledger.ts';
import { appendCostProjection } from '../src/audits/costs.ts';
import { advisoryXactLock } from '../src/db/advisory-lock.ts';
import { commandCenter } from '../src/projects/command-center.ts';
import { getVisibility } from '../src/visibility/dashboard.ts';
import { persistComparisonBaselines } from '../src/visibility/baselines.ts';
import type { Database } from '../src/db/database.ts';
import { purgeExpiredTrialProjects } from '../src/projects/trial-purge.ts';
import { createDiscovery } from '../src/projects/discovery.ts';
import { discoveryCreate } from '../src/projects/discovery-inputs.ts';
import { policy } from '../src/config.ts';
import { billingAccount, grant, prompt, promptSet } from './prompt-fixtures.ts';
import { COMPETITORS_WRITE } from '../src/commands/competitors.ts';
import {
  asOwner,
  Fixtures,
  ownerActor,
  sessionToken,
  testConfig,
  testDatabase,
} from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';
import { actionFixture, type ActionSeed } from './action-support.ts';

/** One frozen ChatGPT-only brand run identity: runs carrying it compare. */
const comparedConfiguration = {
  brand_name: 'Acme Corp',
  brand_aliases: [],
  owned_domains: ['acme.example'],
  competitors: [],
  country_code: 'US',
  language_code: 'en',
  benchmark_mode: 'consumer_like',
  panel_hash: 'panel-1',
  engine_routes: { chatgpt: { transport_provider: 'test', transport_model: 'test' } },
  measurement_policy: { retrieval_enabled: true, max_output_tokens: 1000, answer_instruction: '' },
};

/** A two-answer run's aggregate where `count` answers mention the brand. */
function mentionAggregate(count: number) {
  const metrics = {
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
  return { ...metrics, per_engine: { chatgpt: metrics } };
}

/** A run's metric snapshot written directly: no baseline is persisted by it. */
async function rawSnapshot(database: Database, t: Tenant, auditId: string, count: number) {
  await database
    .insertInto('metric_snapshots')
    .values({
      id: randomUUID(),
      workspace_id: t.workspaceId,
      project_id: t.projectId,
      audit_id: auditId,
      analyzer_version: 'test',
      scoring_rule_version: 'test',
      total_completed: 2,
      total_failed: 0,
      visibility_score: 0,
      metrics: JSON.stringify(mentionAggregate(count)),
      source_analysis_ids: '[]',
      source_artifact_ids: '[]',
      owned_citation_count: 0,
      owned_citation_ids: '[]',
      owned_citation_pages: '[]',
      created_at: new Date(),
    })
    .execute();
}

describe('project owner', () => {
  const db = testDatabase();
  const fixtures = new Fixtures(db);
  const measurements = new VisibilityFixtures(db);
  afterAll(async () => {
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
    const workspace = await fixtures.ownedWorkspace(user, { access: false });
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
    const renamed = await createApp(testConfig(), db).request(`/api/v1/projects/${created.id}`, {
      method: 'PATCH',
      headers: {
        cookie: `${testConfig().session.cookieName}=${await sessionToken({ sub: t.userId, ver: 0 })}`,
        'X-Workspace-Id': t.workspaceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toEqual({
      ...created,
      name: 'Renamed',
      updated_at: expect.any(String),
    });
    const changed = await updateProject(
      db,
      ownerActor(t.workspaceId, t.userId, COMPETITORS_WRITE),
      created.id,
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
  it('keeps competitor and domain rows, IDs and logos across repeated editor saves', async () => {
    const t = await tenant();
    const created = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({
        name: 'Repeat',
        brand_name: 'Repeat',
        owned_domains: ['repeat.com'],
        competitors: [
          { name: 'Globex', domains: ['globex.com'] },
          { name: 'Initech', domains: ['initech.com'] },
        ],
      }),
    );
    const globex = created.competitors.find((item) => item.name === 'Globex')!;
    const logoId = randomUUID();
    const logoDomain = `logo-${logoId}.example`;
    const now = new Date();
    await db
      .insertInto('brand_logo_assets')
      .values({
        id: logoId,
        domain: logoDomain,
        status: 'ready',
        source_url: `https://${logoDomain}/icon.png`,
        content_type: 'image/png',
        image_data: Buffer.from([1]),
        byte_size: 1,
        sha256: 'a'.repeat(64),
        fetched_at: now,
        retry_after: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .updateTable('competitors')
      .set({ logo_asset_id: logoId })
      .where('id', '=', globex.id)
      .execute();
    const ownedIds = async () =>
      (
        await db
          .selectFrom('owned_domains')
          .select(['id', 'domain'])
          .where('project_id', '=', created.id)
          .orderBy('domain')
          .execute()
      ).map((row) => [row.domain, row.id]);
    const repeatId = (await ownedIds())[0]![1];
    const app = createApp(testConfig(), db);
    const save = async (body: unknown) =>
      app.request(`/api/v1/projects/${created.id}`, {
        method: 'PATCH',
        headers: {
          cookie: `${testConfig().session.cookieName}=${await sessionToken({ sub: t.userId, ver: 0 })}`,
          'X-Workspace-Id': t.workspaceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const edit = {
      owned_domains: ['repeat.com', 'repeat.net'],
      competitors: [
        { name: 'globex', aliases: ['Globex Corp'], domains: ['globex.com'] },
        { name: 'Hooli', domains: ['hooli.com'] },
      ],
    };
    const first = await save(edit);
    expect(first.status).toBe(200);
    const once = projectSchema.parse(await first.json());
    const domainsOnce = await ownedIds();
    const second = projectSchema.parse(await (await save(edit)).json());
    const hooli = once.competitors.find((item) => item.name === 'Hooli')!;
    expect(second.competitors).toEqual(once.competitors);
    expect(
      second.competitors.map(({ id, name, aliases, domains, logo_url }) => ({
        id,
        name,
        aliases,
        domains,
        has_logo: logo_url !== null,
      })),
    ).toEqual([
      {
        id: globex.id,
        name: 'globex',
        aliases: ['Globex Corp'],
        domains: ['globex.com'],
        has_logo: true,
      },
      { id: hooli.id, name: 'Hooli', aliases: [], domains: ['hooli.com'], has_logo: false },
    ]);
    expect(domainsOnce[0]).toEqual(['repeat.com', repeatId]);
    expect(domainsOnce.map(([domain]) => domain)).toEqual(['repeat.com', 'repeat.net']);
    expect(await ownedIds()).toEqual(domainsOnce);
    const saved = await save({ owned_domains: ['REPEAT.com'] });
    expect(saved.status).toBe(200);
    expect(await ownedIds()).toEqual([['REPEAT.com', repeatId]]);
    const renamed = await save({
      competitors: [{ id: globex.id, name: 'Globex Group', domains: ['globex.com'] }],
    });
    expect(projectSchema.parse(await renamed.json()).competitors).toEqual([
      expect.objectContaining({ id: globex.id, name: 'Globex Group', aliases: [] }),
    ]);
    const renamedLogo = second.competitors.find((item) => item.id === globex.id)!.logo_url;
    expect(
      (await readProject(db, { workspaceId: t.workspaceId, projectId: created.id })).competitors[0]!
        .logo_url,
    ).toBe(renamedLogo);
    const foreign = await save({ competitors: [{ id: randomUUID(), name: 'Ghost' }] });
    expect(foreign.status).toBe(404);
    const duplicate = await save({ competitors: [{ name: 'Hooli' }, { name: 'hooli' }] });
    expect(duplicate.status).toBe(409);
    for (const tooLong of [
      { owned_domains: [`${'a'.repeat(252)}.com`] },
      { brand: { aliases: ['a'.repeat(256)] } },
      { competitors: [{ name: 'Globex', domains: [`${'g'.repeat(252)}.com`] }] },
    ])
      expect((await save(tooLong)).status).toBe(422);
    await db.deleteFrom('brand_logo_assets').where('id', '=', logoId).execute();
  });
  it('defaults common-word names to needing context and saves only touched, tracked rules', async () => {
    const t = await tenant();
    const created = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({
        name: 'Target',
        brand_name: 'Target',
        products_services: ['Home goods'],
        competitors: [{ name: 'Globex', domains: ['globex.com'] }],
      }),
    );
    expect(created.brand.matching).toMatchObject({
      mode: 'context_required',
      common_word: true,
      context_terms: ['Home goods'],
    });
    expect(created.competitors[0]!.matching).toMatchObject({ mode: 'always', common_word: false });
    const changed = await updateProject(
      db,
      ownerActor(t.workspaceId, t.userId, COMPETITORS_WRITE),
      created.id,
      projectUpdate.parse({
        entity_matching: [
          { name: 'Globex', mode: 'context_required', context_terms: ['retail'] },
          { name: 'Untracked Co', mode: 'context_required' },
        ],
      }),
    );
    expect(changed.competitors[0]!.matching).toMatchObject({
      mode: 'context_required',
      context_terms: ['retail'],
    });
    const profile = await db
      .selectFrom('brand_profiles')
      .select('business_context')
      .where('project_id', '=', created.id)
      .executeTakeFirstOrThrow();
    expect(
      Object.keys(
        (profile.business_context as { entity_matching: { entities: object } }).entity_matching
          .entities,
      ),
    ).toEqual(['globex']);
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
      headers: { ...headers, 'X-Workspace-Id': t.workspaceId, 'Content-Type': 'application/json' },
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
  it('changes a project only through the active workspace that holds it', async () => {
    const t = await tenant();
    const project = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({ name: 'Held' }),
    );
    const other = await tenant();
    const writer = await fixtures.user();
    await fixtures.member(t.workspaceId, writer, 'member');
    await fixtures.member(other.workspaceId, writer, 'member');
    const app = createApp(testConfig(), db);
    const cookie = `${testConfig().session.cookieName}=${await sessionToken({ sub: writer, ver: 0 })}`;
    const rename = (workspaceId: string, name: string) =>
      app.request(`/api/v1/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          cookie,
          'X-Workspace-Id': workspaceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
    expect((await rename(other.workspaceId, 'Elsewhere')).status).toBe(404);
    const held = await rename(t.workspaceId, 'Renamed');
    expect(held.status).toBe(200);
    expect(await held.json()).toMatchObject({ name: 'Renamed' });
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
        'Content-Type': 'application/json',
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
    // The switcher's summary, not the project view: no prompts, competitors or domains.
    expect(await response.json()).toEqual([
      {
        id: project.id,
        name: 'Mine',
        brand_name: project.brand_name,
        website_url: project.website_url,
        brand: { logo_url: null },
      },
    ]);
    expect((await app.request('/api/v1/projects')).status).toBe(401);
  });
  it("keeps a deleted project's answer-engine costs with their exact source IDs", async () => {
    const retained = new VisibilityFixtures(db);
    const t = await retained.tenant();
    const account = await billingAccount(db, t.workspaceId);
    await grant(db, account, { key: 'project_deletion', value: 1 });
    const audit = await retained.audit(t);
    const { taskId } = await retained.execution(t, { auditId: audit });
    const artifact = await db
      .selectFrom('raw_response_artifacts')
      .select('id')
      .where('task_id', '=', taskId)
      .executeTakeFirstOrThrow();
    const projection = await db
      .transaction()
      .execute((trx) => appendCostProjection(trx, t.workspaceId, artifact.id));
    await deleteProject(db, { workspaceId: t.workspaceId, projectId: t.projectId });
    expect(
      await db
        .selectFrom('execution_cost_projections')
        .select(['audit_id', 'task_id', 'raw_response_artifact_id'])
        .where('id', '=', projection!.id)
        .execute(),
    ).toEqual([{ audit_id: audit, task_id: taskId, raw_response_artifact_id: artifact.id }]);
    expect(
      await db
        .selectFrom('internal_costs')
        .select(['source', 'workspace_id', 'feature', 'provider', 'model', 'cost_microusd'])
        .where('source_id', '=', projection!.id)
        .execute(),
    ).toEqual([
      {
        source: 'answer_engine',
        workspace_id: t.workspaceId,
        feature: 'chatgpt',
        provider: 'test',
        model: 'test-model',
        // The fixture's answer reports no usage: its cost is unknown, not zero.
        cost_microusd: null,
      },
    ]);
  });
  it('deletes a project with audit history once its credits are settled, keeping the ledger and its source IDs', async () => {
    const retained = new VisibilityFixtures(db);
    const t = await retained.tenant();
    await db
      .updateTable('projects')
      .set({ benchmark_mode: 'consumer_like' })
      .where('id', '=', t.projectId)
      .execute();
    const account = await billingAccount(db, t.workspaceId);
    await grant(db, account, { key: 'project_deletion', value: 1 });
    const audit = await retained.audit(t);
    const { taskId } = await retained.execution(t, { auditId: audit });
    const grantId = await grant(db, account, { key: 'prompt_runs_per_period', value: 1 });
    const reservationId = randomUUID();
    const entry = (kind: 'reservation' | 'release') => {
      const id = randomUUID();
      return {
        id,
        billing_account_id: account,
        grant_id: grantId,
        capability_key: 'prompt_runs_per_period',
        entry_kind: kind,
        reservation_id: reservationId,
        subject_kind: 'audit',
        subject_id: audit,
        workspace_id: t.workspaceId,
        audit_id: audit,
        task_id: taskId,
        agent_run_id: null,
        site_crawl_id: null,
        dispatch_key: kind,
        request_fingerprint: '',
        allocation_order: 0,
        refund_of_id: null,
        attempt: null,
        units: 1,
        idempotency_key: id,
        created_at: new Date(),
      };
    };
    await db.insertInto('consumable_ledger').values(entry('reservation')).execute();
    const scope = { workspaceId: t.workspaceId, projectId: t.projectId };
    await expect(deleteProject(db, scope)).rejects.toMatchObject({
      status: 409,
      code: 'project_work_running',
    });
    expect(
      await db.selectFrom('audits').select('id').where('id', '=', audit).executeTakeFirst(),
    ).toEqual({ id: audit });

    await db.insertInto('consumable_ledger').values(entry('release')).execute();
    await deleteProject(db, scope);
    expect(
      await db.selectFrom('projects').select('id').where('id', '=', t.projectId).execute(),
    ).toEqual([]);
    const ledger = await db
      .selectFrom('consumable_ledger')
      .select(['entry_kind', 'subject_id', 'audit_id', 'task_id'])
      .where('reservation_id', '=', reservationId)
      .orderBy('entry_kind')
      .execute();
    // Billing keeps the exact source IDs of work that no longer exists.
    expect(ledger).toEqual([
      { entry_kind: 'release', subject_id: audit, audit_id: audit, task_id: taskId },
      { entry_kind: 'reservation', subject_id: audit, audit_id: audit, task_id: taskId },
    ]);
  });
  it('refuses a reservation that waited behind the deletion of its project', async () => {
    const retained = new VisibilityFixtures(db);
    const t = await retained.tenant();
    const account = await billingAccount(db, t.workspaceId);
    await grant(db, account, { key: 'prompt_runs_per_period', value: 1 });
    const audit = await retained.audit(t);
    const { taskId } = await retained.execution(t, { auditId: audit });
    const { reservation } = await db.transaction().execute(async (deletion) => {
      const blocker = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(deletion);
      await advisoryXactLock(deletion, policy.entitlements.capacity_lock, account);
      const pending = db
        .transaction()
        .execute((trx) =>
          hold(trx, {
            capability: 'prompt_runs_per_period',
            subject: { kind: 'audit', id: taskId, workspaceId: t.workspaceId, auditId: audit },
            units: 1,
            at: new Date(),
          }),
        )
        .catch((error: unknown) => error);
      await vi.waitFor(
        async () => {
          const blocked = await sql<{ waiting: boolean }>`select exists (
            select 1 from pg_stat_activity where ${blocker.rows[0]!.pid} = any(pg_blocking_pids(pid))
          ) as waiting`.execute(db);
          expect(blocked.rows[0]!.waiting).toBe(true);
        },
        { timeout: 2000, interval: 20 },
      );
      await removeProject(deletion, { workspaceId: t.workspaceId, projectId: t.projectId });
      return { reservation: pending };
    });
    expect(await reservation).toMatchObject({ message: 'subject_not_found' });
    expect(
      await db.selectFrom('consumable_ledger').select('id').where('task_id', '=', taskId).execute(),
    ).toEqual([]);
  });
  it('lets an admin delete a project but not a member', async () => {
    const t = await tenant();
    await grant(db, t.accountId, { key: 'project_deletion', value: 1 });
    const project = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({ name: 'Disposable' }),
    );
    const app = createApp(testConfig(), db);
    const remove = async (role: 'member' | 'admin') => {
      const user = await fixtures.user();
      await fixtures.member(t.workspaceId, user, role);
      const token = await sessionToken({ sub: user, ver: 0 });
      const response = await app.request(`/api/v1/projects/${project.id}`, {
        method: 'DELETE',
        headers: { cookie: `${testConfig().session.cookieName}=${token}` },
      });
      return response.status;
    };
    expect(await remove('member')).toBe(403);
    expect(await remove('admin')).toBe(204);
  });

  const day = 86_400_000;
  /** A public workspace whose only access was a trial that ended `endedDaysAgo` days ago. */
  async function trialWorkspace(
    endedDaysAgo: number,
    { paid = false, project = true, checkout = false } = {},
  ) {
    const t = await tenant();
    await db
      .updateTable('billing_accounts')
      .set({ registration_origin: 'public' })
      .where('id', '=', t.accountId)
      .execute();
    // Made while the trial was open, then the fixture's operator grants give way to it.
    const created = project
      ? await createProject(db, t.workspaceId, t.userId, projectCreate.parse({ name: 'Trial' }))
      : null;
    // A discovery still in progress has no project to cascade from.
    const discovery = await createDiscovery(
      db,
      t.workspaceId,
      discoveryCreate.parse({
        brand_name: 'Acme',
        website_url: 'acme.com',
        primary_market: 'US',
      }),
      randomUUID(),
    );
    // The fixture's operator access grant is not a trial; this account is trial-only.
    await asOwner((owner) =>
      owner.deleteFrom('account_grants').where('billing_account_id', '=', t.accountId).execute(),
    );
    const end = new Date(Date.now() - endedDaysAgo * day);
    await db
      .insertInto('account_grants')
      .values({
        id: randomUUID(),
        billing_account_id: t.accountId,
        source_kind: 'trial',
        source_ref: 'test',
        bundle_role: 'primary',
        bundle_id: `trial-${t.accountId}`,
        profile_key: policy.entitlements.public_trial.profile,
        key: 'workspace_access',
        value: 1,
        valid_from: new Date(end.getTime() - 7 * day),
        valid_until: end,
        catalog_revision: 'test',
        idempotency_key: randomUUID(),
        created_at: new Date(),
      })
      .execute();
    if (paid) await grant(db, t.accountId, { key: 'project_slots', value: 1 });
    // A returning customer paid for a plan whose settlement has not landed yet.
    if (checkout)
      await db
        .insertInto('pending_activations')
        .values({
          id: randomUUID(),
          billing_account_id: t.accountId,
          activation_kind: 'base',
          catalog_key: 'tier_1',
          catalog_revision: 'test',
          country_code: 'US',
          credential_mode: 'byok',
          region: 'international',
          quantity: 1,
          provider: 'razorpay',
          provider_mode: 'test',
          external_reference: `sub_${randomUUID().replaceAll('-', '')}`,
          idempotency_key: randomUUID(),
          request_fingerprint: 'test',
          status: 'pending',
          expires_at: new Date(Date.now() + day),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    return {
      accountId: t.accountId,
      projectId: created?.id ?? null,
      discoveryId: discovery.id,
    };
  }

  /** Which of the workspace's project and discovery are still stored. */
  async function survivors(workspace: { projectId: string | null; discoveryId: string }) {
    const projects = await db
      .selectFrom('projects')
      .select('id')
      .where('id', '=', workspace.projectId!)
      .execute();
    const discoveries = await db
      .selectFrom('brand_discoveries')
      .select('id')
      .where('id', '=', workspace.discoveryId)
      .execute();
    return { project: projects.length === 1, discovery: discoveries.length === 1 };
  }

  it('purges trial-only projects and incomplete discoveries 30 days after the trial ends, and nothing else', async () => {
    const expired = await trialWorkspace(31);
    const discoveryOnly = await trialWorkspace(31, { project: false });
    const recent = await trialWorkspace(10);
    const upgraded = await trialWorkspace(31, { paid: true });
    const paying = await trialWorkspace(31, { checkout: true });
    await purgeExpiredTrialProjects(db, new Date());
    const left = await db
      .selectFrom('projects')
      .select('id')
      .where('id', 'in', [
        expired.projectId!,
        recent.projectId!,
        upgraded.projectId!,
        paying.projectId!,
      ])
      .execute();
    const kept = [recent, upgraded, paying];
    expect(left.map((row) => row.id).sort()).toEqual(kept.map((w) => w.projectId).sort());
    const seeded = [expired, discoveryOnly, ...kept].map((w) => w.discoveryId);
    const discoveries = await db
      .selectFrom('brand_discoveries')
      .select('id')
      .where('id', 'in', seeded)
      .execute();
    expect(discoveries.map((row) => row.id).sort()).toEqual(kept.map((w) => w.discoveryId).sort());
    const tasks = await db
      .selectFrom('brand_discovery_tasks')
      .select('discovery_id')
      .where('discovery_id', 'in', seeded)
      .execute();
    expect(tasks.map((row) => row.discovery_id).sort()).toEqual(
      kept.map((w) => w.discoveryId).sort(),
    );
  });

  it('keeps a trial workspace that gained an expired non-trial grant after the purge picked it', async () => {
    const workspace = await trialWorkspace(31);
    const purge = await db.transaction().execute(async (issuer) => {
      const blocker = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(issuer);
      await advisoryXactLock(issuer, policy.entitlements.capacity_lock, workspace.accountId);
      // An operator grant that has already ended, committed after the candidates were chosen.
      await grant(issuer, workspace.accountId, {
        key: 'workspace_access',
        value: 1,
        sourceKind: 'override',
        validFrom: new Date(Date.now() - 40 * day),
        validUntil: new Date(Date.now() - 35 * day),
      });
      const running = purgeExpiredTrialProjects(db, new Date()).catch((error: unknown) => error);
      await vi.waitFor(
        async () => {
          const blocked = await sql<{ waiting: boolean }>`select exists (
            select 1 from pg_stat_activity where ${blocker.rows[0]!.pid} = any(pg_blocking_pids(pid))
          ) as waiting`.execute(db);
          expect(blocked.rows[0]!.waiting).toBe(true);
        },
        { timeout: 5000, interval: 20 },
      );
      return { running };
    });
    expect(typeof (await purge.running)).toBe('number');
    expect(await survivors(workspace)).toEqual({ project: true, discovery: true });
  });

  it('purges while a domain-first transaction holds a project row and then takes the capacity lock', async () => {
    const workspace = await trialWorkspace(31);
    const purge = await db.transaction().execute(async (holder) => {
      const blocker = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(holder);
      // Lock DAG: a domain row first, then the account's capacity lock.
      await holder
        .selectFrom('brands')
        .select('id')
        .where('project_id', '=', workspace.projectId!)
        .forUpdate()
        .execute();
      const running = purgeExpiredTrialProjects(db, new Date()).catch((error: unknown) => error);
      await vi.waitFor(
        async () => {
          const blocked = await sql<{ waiting: boolean }>`select exists (
            select 1 from pg_stat_activity where ${blocker.rows[0]!.pid} = any(pg_blocking_pids(pid))
          ) as waiting`.execute(db);
          expect(blocked.rows[0]!.waiting).toBe(true);
        },
        { timeout: 5000, interval: 20 },
      );
      await advisoryXactLock(holder, policy.entitlements.capacity_lock, workspace.accountId);
      return { running };
    });
    expect(typeof (await purge.running)).toBe('number');
    expect(await survivors(workspace)).toEqual({ project: false, discovery: false });
  });

  it('overview reads persisted state and counts only enabled active prompts', async () => {
    const t = await tenant();
    const project = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({ name: 'Overview' }),
    );
    const scope = { workspaceId: t.workspaceId, projectId: project.id };
    // Measurement leads the ladder: without prompts there is nothing to measure.
    expect((await commandCenter(db, scope, null)).next_action).toMatchObject({
      kind: 'configure_prompts',
      href: '/prompts',
    });
    const set = await promptSet(db, project.id);
    await prompt(db, set, 'Which service?');
    const disabled = await prompt(db, set, 'Which vendor?');
    await db.updateTable('prompts').set({ enabled: false }).where('id', '=', disabled).execute();
    const view = await commandCenter(db, scope, null);
    expect(view).toMatchObject({
      active_prompt_count: 1,
      next_action: { kind: 'audit', href: '/runs' },
      report_available: false,
      loop: { tracked: { state: 'not_run' } },
      state: { visibility: { value: null, delta: null } },
    });
    // A first audit under way is reported as running, not as a step to take.
    const running = await new VisibilityFixtures(db).audit(
      { userId: t.userId, ...scope },
      { status: 'running', completedAt: null },
    );
    expect((await commandCenter(db, scope, null)).next_action).toMatchObject({
      kind: 'audit_running',
      href: `/runs/${running}`,
    });
    await expect(
      commandCenter(db, { workspaceId: t.workspaceId, projectId: project.id }, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('reads the action order once for the overview and versions its actions with it', async () => {
    const t = await tenant();
    const project = await createProject(
      db,
      t.workspaceId,
      t.userId,
      projectCreate.parse({ name: 'Ordered' }),
    );
    const scope = { workspaceId: t.workspaceId, projectId: project.id };
    const now = new Date();
    await db
      .insertInto('opportunity_orders')
      .values({
        id: randomUUID(),
        workspace_id: t.workspaceId,
        project_id: project.id,
        ordered_keys: '[]',
        version: 3,
        updated_by_user_id: t.userId,
        created_at: now,
        updated_at: now,
      })
      .execute();
    let orderReads = 0;
    const observed = db.withPlugin({
      transformQuery: ({ node }) => {
        if (
          node.kind === 'SelectQueryNode' &&
          JSON.stringify(node).includes('"opportunity_orders"')
        )
          orderReads += 1;
        return node;
      },
      transformResult: ({ result }) => Promise.resolve(result),
    });

    const view = await commandCenter(observed, scope, null);

    expect(view.action_order_version).toBe(3);
    expect(orderReads).toBe(1);
  });
  it('retains exact declaration and verified observation IDs in resolved action summaries', async () => {
    // Immutable fixture evidence is retained until the disposable database is dropped.
    const seeded = await actionFixture<ActionSeed>('seed');
    const actionId = seeded.actions.missing_structured_data!;
    const action = await db
      .selectFrom('actions')
      .select('opportunity_snapshot_id')
      .where('id', '=', actionId)
      .executeTakeFirstOrThrow();
    const scope = { workspaceId: seeded.workspace_id, projectId: seeded.project_id };
    const now = new Date();
    const implementationId = randomUUID();
    await db
      .insertInto('opportunity_implementation_events')
      .values({
        id: implementationId,
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        action_id: actionId,
        actor_user_id: seeded.user_id,
        created_at: now,
        declared_implemented_at: now,
        expected_checks: '[]',
        idempotency_key: implementationId,
        member_opportunity_ids: '[]',
        opportunity_snapshot_id: action.opportunity_snapshot_id!,
        output_revision_id: null,
        request_fingerprint: 'recorded-test',
        target_external_url: null,
        target_site_url_ids: '[]',
      })
      .execute();
    const verifiedId = randomUUID();
    await db
      .insertInto('opportunity_verification_events')
      .values({
        id: verifiedId,
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        implementation_event_id: implementationId,
        audit_id: null,
        crawl_id: null,
        created_at: now,
        observed_at: now,
        idempotency_key: verifiedId,
        limitations: '[]',
        observation_kind: 'verified',
        result: '{}',
        source_analysis_ids: '[]',
        source_metric_ids: '[]',
        source_rule_evaluation_ids: '[]',
        verifier_version: '1',
      })
      .execute();
    const observation = await db
      .selectFrom('opportunity_verification_events')
      .selectAll()
      .where('id', '=', verifiedId)
      .executeTakeFirstOrThrow();
    await db
      .insertInto('opportunity_verification_events')
      .values({
        ...observation,
        id: randomUUID(),
        idempotency_key: randomUUID(),
        created_at: new Date(now.getTime() + 1000),
      })
      .execute();
    await db
      .updateTable('audits')
      .set({ status: 'failed' })
      .where('project_id', '=', scope.projectId)
      .execute();
    expect((await commandCenter(db, scope, null)).resolved_actions).toMatchObject({
      count: 1,
      evidence: [
        {
          action_id: actionId,
          implementation_event_ids: [implementationId],
          verification_event_ids: [verifiedId],
        },
      ],
    });
  }, 60_000);
  it('overview compares frozen measurements and keeps unknown metrics distinct from observed zero', async () => {
    const t = await measurements.tenant();
    await db
      .updateTable('projects')
      .set({ benchmark_mode: 'consumer_like' })
      .where('id', '=', t.projectId)
      .execute();
    await measurements.brand(t.projectId, 'Acme Corp');
    const configuration = comparedConfiguration;
    async function measured(
      at: string,
      count: number,
      score: number,
      config = configuration,
      status = 'completed',
    ) {
      const id = await measurements.audit(t, {
        completedAt: new Date(at),
        configuration: config,
        status,
      });
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
    // A partially completed run is read like a completed one, as on the Visibility page.
    const current = await measured(
      '2026-03-03T00:00:00Z',
      2,
      40,
      configuration,
      'partially_completed',
    );
    const view = await commandCenter(db, t, null);
    expect(view).toMatchObject({
      measurement: {
        audit_id: current,
        comparable_audit_id: baseline,
        analyzer_version: 'test',
        scoring_rule_version: 'test',
      },
      // Visibility is the mention rate (2 of 2 answers), not the weighted score (40).
      state: { visibility: { value: 100, delta: 100 } },
      track: { citation_share: { value: 0, delta: 0 } },
      report_available: true,
      stale: false,
    });
    const historical = await commandCenter(db, t, baseline);
    expect(historical).toMatchObject({ stale: true, loop: { tracked: { freshness: 'unknown' } } });
    expect(
      await db
        .selectFrom('metric_snapshots')
        .select('audit_id')
        .where('id', '=', view.measurement!.metric_snapshot_id!)
        .executeTakeFirst(),
    ).toEqual({ audit_id: current });
    expect(historical.state.visibility).toEqual({
      value: 0,
      delta: null,
    });
    await expect(
      commandCenter(db, { ...t, workspaceId: randomUUID() }, null),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('overview and visibility compare a run with the one baseline finalization persisted', async () => {
    const t = await measurements.tenant();
    await db
      .updateTable('projects')
      .set({ benchmark_mode: 'consumer_like' })
      .where('id', '=', t.projectId)
      .execute();
    await measurements.brand(t.projectId, 'Acme Corp');
    const configuration = comparedConfiguration;
    const run = async (at: string, count: number) => {
      const id = await measurements.audit(t, { completedAt: new Date(at), configuration });
      await measurements.metricSnapshot(t, id, { metrics: mentionAggregate(count) });
      return id;
    };
    /** A snapshot no finalization wrote: nothing persisted its baseline. */
    const raw = async (at: string, count: number) => {
      const id = await measurements.audit(t, { completedAt: new Date(at), configuration });
      await rawSnapshot(db, t, id, count);
      return id;
    };
    const visibilityOf = (auditId: string | null) =>
      getVisibility(db, t, {
        auditId,
        logicalEngine: null,
        baselineId: null,
        selectionMode: auditId ? 'run' : 'latest',
        fromAt: null,
        toAt: null,
        configurationKey: null,
        cohort: 'core',
      });
    const baseline = await run('2026-04-01T00:00:00Z', 0);
    const current = await run('2026-04-03T00:00:00Z', 2);
    const stored = await db
      .selectFrom('audit_comparison_baselines')
      .select(['status', 'baseline_audit_id'])
      .where('audit_id', '=', current)
      .where('cohort', '=', 'core')
      .where('logical_engine', 'is', null)
      .executeTakeFirstOrThrow();
    expect(stored).toEqual({ status: 'comparable', baseline_audit_id: baseline });
    // A compatible run between them that no finalization saw changes neither read.
    await raw('2026-04-02T00:00:00Z', 1);
    const overview = await commandCenter(db, t, null);
    const dashboard = await visibilityOf(null);
    expect(overview.measurement).toMatchObject({
      audit_id: current,
      comparable_audit_id: baseline,
      comparison_status: 'comparable',
    });
    expect(dashboard.comparison).toMatchObject({
      status: 'comparable',
      baseline_audit_id: baseline,
    });
    expect(overview.state.visibility).toEqual({ value: 100, delta: 100 });
    expect(overview.track.limitations).toEqual([]);
    // A finalized run whose baseline is not persisted yet is pending, not baseline-less,
    // and the Overview says so in the words Visibility uses.
    const pending = await raw('2026-04-04T00:00:00Z', 2);
    const pendingView = await commandCenter(db, t, null);
    expect(pendingView.measurement).toMatchObject({
      audit_id: pending,
      comparable_audit_id: null,
      comparison_status: 'baseline_pending',
    });
    expect(pendingView.track.limitations).toEqual([
      'The comparison with an earlier run is still being prepared.',
    ]);
    expect((await visibilityOf(pending)).comparison).toMatchObject({ status: 'baseline_pending' });
    // The first run has nothing before it.
    const first = await commandCenter(db, t, baseline);
    expect(first.measurement).toMatchObject({
      comparable_audit_id: null,
      comparison_status: 'no_baseline',
    });
    expect(first.track.limitations).toEqual(['No earlier run to compare with yet.']);
    // Another workspace reads none of it.
    const outsider = await measurements.tenant();
    await expect(
      commandCenter(db, { workspaceId: outsider.workspaceId, projectId: t.projectId }, current),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('two runs finalizing together still name each other, in either commit order', async () => {
    const configuration = comparedConfiguration;
    for (const laterCommitsFirst of [true, false]) {
      const t = await measurements.tenant();
      await measurements.brand(t.projectId, 'Acme Corp');
      const first = await measurements.audit(t, {
        completedAt: new Date('2026-04-01T00:00:00Z'),
        configuration,
      });
      await measurements.metricSnapshot(t, first, { metrics: mentionAggregate(0) });
      const unsettled = { completedAt: null, status: 'analyzing', configuration };
      const earlier = await measurements.audit(t, unsettled);
      const later = await measurements.audit(t, unsettled);
      // One finalization's measured run and baselines, uncommitted until its transaction ends.
      const finalize = async (
        trx: Database,
        { auditId, at, count }: { auditId: string; at: string; count: number },
      ) => {
        await trx
          .updateTable('audits')
          .set({ status: 'completed', completed_at: new Date(at) })
          .where('id', '=', auditId)
          .execute();
        await rawSnapshot(trx, t, auditId, count);
        await persistComparisonBaselines(trx, { workspaceId: t.workspaceId, auditId });
      };
      const runs = [
        { auditId: earlier, at: '2026-04-02T00:00:00Z', count: 1 },
        { auditId: later, at: '2026-04-03T00:00:00Z', count: 2 },
      ];
      const [opening, closing] = laterCommitsFirst ? [runs[1]!, runs[0]!] : [runs[0]!, runs[1]!];
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let written = () => {};
      const holding = new Promise<void>((resolve) => {
        written = resolve;
      });
      const one = db.transaction().execute(async (trx) => {
        await finalize(trx, opening);
        written();
        await held;
      });
      await holding;
      let waiter: number | null = null;
      const two = db.transaction().execute(async (trx) => {
        const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
        waiter = rows[0]!.pid;
        await finalize(trx, closing);
      });
      // The second finalization waits on the first's baseline lock, not past it.
      await vi.waitFor(
        async () => {
          const { rows } = await sql<{ waiting: number }>`
            select count(*)::int as waiting from pg_locks
            where pid = ${waiter} and locktype = 'advisory' and not granted`.execute(db);
          expect(rows[0]?.waiting).toBe(1);
        },
        { timeout: 10_000, interval: 50 },
      );
      release();
      await Promise.all([one, two]);
      const stored = await db
        .selectFrom('audit_comparison_baselines')
        .select(['audit_id', 'status', 'baseline_audit_id'])
        .where('audit_id', 'in', [earlier, later])
        .where('cohort', '=', 'core')
        .where('logical_engine', 'is', null)
        .execute();
      expect(Object.fromEntries(stored.map((row) => [row.audit_id, row]))).toEqual({
        [earlier]: { audit_id: earlier, status: 'comparable', baseline_audit_id: first },
        [later]: { audit_id: later, status: 'comparable', baseline_audit_id: earlier },
      });
    }
  }, 60_000);
});
