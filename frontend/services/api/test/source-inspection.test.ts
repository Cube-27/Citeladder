import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';

import { policy } from '../src/config.ts';
import { record } from '../src/db/json.ts';
import { enqueueTask } from '../src/referrals/enqueue.ts';
import { createWebsiteFetcher } from '../src/projects/safe-fetch.ts';
import { authorizeAcquisition } from '../src/web-evidence/acquisition.ts';
import { canonicalIdentity } from '../src/site-health/url-identity.ts';
import { claimPages, spendRedirect } from '../src/source-pages/admission.ts';
import { assessPage } from '../src/source-pages/assessment.ts';
import { extractSourcePage } from '../src/source-pages/extract.ts';
import { recordInspection } from '../src/source-pages/persistence.ts';
import { projectRoster } from '../src/source-pages/reading.ts';
import { syncPages } from '../src/source-pages/sync.ts';
import { sourcePageInspector, compensateInspection } from '../src/source-pages/inspector.ts';
import { settlePlacements } from '../src/source-pages/placement-settlement.ts';
import { refreshDifferentiation } from '../src/source-pages/differentiation.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});
async function seed(urls = ['https://publisher.test/review']) {
  const tenant = await fixtures.tenant();
  const configuration = {
    brand_name: 'Acme',
    brand_aliases: [],
    competitors: [{ name: 'Rival', aliases: [] }],
  };
  const audit = await fixtures.audit(tenant, { configuration });
  await fixtures.execution(tenant, {
    auditId: audit,
    analysis: { citations: urls.map((url) => ({ url, urlHash: canonicalIdentity(url).hash })) },
  });
  for (const url of urls)
    await db
      .updateTable('citations')
      .set({
        canonical_url: canonicalIdentity(url).url,
        url_identity_method: 'verbatim',
        url_identity_version: policy.source_pages.identity_version,
      })
      .where('workspace_id', '=', tenant.workspaceId)
      .where('audit_id', '=', audit)
      .where('url', '=', url)
      .execute();
  const scope = { workspaceId: tenant.workspaceId, projectId: tenant.projectId };
  const id = await enqueueTask(db, {
    ...scope,
    kind: 'source_page_inspection',
    keyParts: [audit],
    payload: { audit_id: audit },
    maxAttempts: 2,
  });
  const task = await db
    .updateTable('analytics_tasks')
    .set({
      status: 'running',
      lease_owner: 'source-test',
      lease_expires_at: new Date(Date.now() + 120000),
    })
    .where('id', '=', id!)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { ...tenant, scope, audit, task, configuration };
}
it('synchronizes canonical citation recurrence idempotently and serializes concurrent budget admission', async () => {
  const own = await seed(
    Array.from({ length: 10 }, (_value, index) => `https://publisher.test/page-${index}`),
  );
  await syncPages(db, own.scope, own.audit);
  await syncPages(db, own.scope, own.audit);
  expect(
    (
      await db
        .selectFrom('source_pages')
        .select('recurrence_count')
        .where('project_id', '=', own.projectId)
        .execute()
    ).map((row) => row.recurrence_count),
  ).toEqual(Array(10).fill(1));
  await db
    .insertInto('source_page_inspection_spend')
    .values({
      id: randomUUID(),
      workspace_id: own.workspaceId,
      project_id: own.projectId,
      source_page_id: null,
      spend_kind: 'page',
      units: policy.source_pages.budget_per_window - 1,
      idempotency_key: randomUUID(),
      created_at: new Date(),
    })
    .execute();
  const claims = await Promise.all([claimPages(db, own.scope), claimPages(db, own.scope)]);
  expect(claims.flat()).toHaveLength(1);
  expect(await spendRedirect(db, own.scope, 'https://redirect.test/token')).toBe('exhausted');
  const foreign = await fixtures.tenant();
  await expect(
    claimPages(db, { workspaceId: foreign.workspaceId, projectId: own.projectId }),
  ).rejects.toThrow('outside its workspace');
});
it('appends exact snapshot and quoted-presence provenance only under the owning task and page leases', async () => {
  const own = await seed();
  await syncPages(db, own.scope, own.audit);
  const claim = (await claimPages(db, own.scope))[0]!;
  const page = extractSourcePage(
    Buffer.from(`<h1>Acme review</h1><p>${'Acme describes its tools. '.repeat(40)}</p>`),
  );
  const assessment = assessPage(page, own.configuration);
  const fetch = {
    outcome: 'inspected' as const,
    requestedUrl: claim.url,
    finalUrl: claim.url,
    status: 200,
  };
  expect(
    await recordInspection(
      db,
      { ...own.task, lease_owner: 'stale' },
      own.scope,
      claim.id,
      claim.lease,
      fetch,
      own.audit,
      projectRoster(own.configuration),
      page,
      assessment,
    ),
  ).toBeNull();
  expect(
    await recordInspection(
      db,
      own.task,
      own.scope,
      claim.id,
      new Date(0),
      fetch,
      own.audit,
      projectRoster(own.configuration),
      page,
      assessment,
    ),
  ).toBeNull();
  const foreign = await seed();
  expect(
    await recordInspection(
      db,
      own.task,
      own.scope,
      claim.id,
      claim.lease,
      fetch,
      foreign.audit,
      projectRoster(own.configuration),
      page,
      assessment,
    ),
  ).toBeNull();
  const snapshot = await recordInspection(
    db,
    own.task,
    own.scope,
    claim.id,
    claim.lease,
    fetch,
    own.audit,
    projectRoster(own.configuration),
    page,
    assessment,
  );
  expect(snapshot).not.toBeNull();
  expect(
    await recordInspection(
      db,
      own.task,
      own.scope,
      claim.id,
      claim.lease,
      fetch,
      own.audit,
      projectRoster(own.configuration),
      page,
      assessment,
    ),
  ).toBeNull();
  const persisted = await db
    .selectFrom('source_page_snapshots')
    .selectAll()
    .where('source_page_id', '=', claim.id)
    .execute();
  expect(persisted).toHaveLength(1);
  const presence = await db
    .selectFrom('source_page_entity_presences')
    .selectAll()
    .where('snapshot_id', '=', snapshot!)
    .where('entity_kind', '=', 'brand')
    .executeTakeFirstOrThrow();
  expect(presence.presence).toBe('present');
  expect(record(persisted[0]!.page_facts).headings).toEqual(['Acme review']);
  expect(presence.roster_version).toBe(projectRoster(own.configuration));
  expect(
    (
      await db
        .selectFrom('source_pages')
        .select('latest_snapshot_id')
        .where('id', '=', claim.id)
        .executeTakeFirstOrThrow()
    ).latest_snapshot_id,
  ).toBe(snapshot);
});
it('runs recorded acquisition through persisted admission, robots refusal and batch handoff without resending fresh evidence', async () => {
  const own = await seed(['https://publisher.test/review', 'https://publisher.test/private']);
  const send = vi.fn(async (url: URL) => {
    expect(
      await db
        .selectFrom('source_page_inspection_spend')
        .select('id')
        .where('project_id', '=', own.projectId)
        .execute(),
    ).toHaveLength(2);
    return url.pathname === '/robots.txt'
      ? {
          status: 200,
          location: undefined,
          type: 'text/plain',
          body: Buffer.from('User-agent: *\nDisallow: /private'),
        }
      : {
          status: 200,
          location: undefined,
          type: 'text/html',
          body: Buffer.from(
            `<h1>Acme review</h1><p>${'Acme tools are measured here. '.repeat(30)}</p>`,
          ),
        };
  });
  const execute = sourcePageInspector(
    createWebsiteFetcher(async () => [{ address: '93.184.216.34', family: 4 }], send),
  );
  const context = { db, maxAttempts: 2, checkCancelled: async () => {} };
  await execute(own.task, context);
  await execute(own.task, context);
  expect(send).toHaveBeenCalledTimes(2);
  const pages = await db
    .selectFrom('source_pages')
    .select(['canonical_url', 'inspection_state'])
    .where('project_id', '=', own.projectId)
    .orderBy('canonical_url')
    .execute();
  expect(pages.map((row) => row.inspection_state)).toEqual(['blocked', 'inspected']);
  expect(
    await db
      .selectFrom('source_page_snapshots')
      .select('id')
      .where('project_id', '=', own.projectId)
      .execute(),
  ).toHaveLength(2);
  expect(
    await db
      .selectFrom('analytics_tasks')
      .select('id')
      .where('project_id', '=', own.projectId)
      .where('task_kind', 'in', ['opportunity_refresh', 'opportunity_verification'])
      .execute(),
  ).toHaveLength(2);
});
it('keeps terminal handoff idempotent and rejects a task whose project belongs to another workspace', async () => {
  const own = await seed();
  const foreign = await fixtures.tenant();
  await db
    .updateTable('analytics_tasks')
    .set({ status: 'failed' })
    .where('id', '=', own.task.id)
    .execute();
  await compensateInspection(db, own.task);
  await compensateInspection(db, own.task);
  expect(
    await db
      .selectFrom('analytics_tasks')
      .select('id')
      .where('project_id', '=', own.projectId)
      .where('task_kind', '=', 'opportunity_refresh')
      .execute(),
  ).toHaveLength(1);
  await expect(
    compensateInspection(db, { ...own.task, workspace_id: foreign.workspaceId }),
  ).rejects.toThrow('outside its workspace');
});
it('rechecks parent and IDNA suppression, resumption and global stops without treating a TLD as a stop', async () => {
  const own = await seed();
  const domains = ['suppressed-pr18.test', 'xn--bcher-kva.test', 'test', '*'];
  await db
    .insertInto('web_acquisition_controls')
    .values({
      domain: 'suppressed-pr18.test',
      blocked: true,
      reason: 'test-only',
      actor_id: own.userId,
      updated_at: new Date(),
    })
    .execute();
  try {
    await expect(
      authorizeAcquisition(db, new URL('https://sub.suppressed-pr18.test/page')),
    ).rejects.toMatchObject({ code: 'acquisition_unavailable' });
    await expect(
      authorizeAcquisition(db, new URL('https://notsuppressed-pr18.test/page')),
    ).resolves.toBeUndefined();
    await db
      .updateTable('web_acquisition_controls')
      .set({ blocked: false })
      .where('domain', '=', domains[0]!)
      .execute();
    await expect(
      authorizeAcquisition(db, new URL('https://sub.suppressed-pr18.test/page')),
    ).resolves.toBeUndefined();
    await db
      .insertInto('web_acquisition_controls')
      .values(
        domains.slice(1, 3).map((domain) => ({
          domain,
          blocked: true,
          reason: 'test-only',
          actor_id: own.userId,
          updated_at: new Date(),
        })),
      )
      .execute();
    await expect(
      authorizeAcquisition(db, new URL('https://shop.bücher.test/page')),
    ).rejects.toMatchObject({ code: 'acquisition_unavailable' });
    await expect(
      authorizeAcquisition(db, new URL('https://other.test/page')),
    ).resolves.toBeUndefined();
    await db
      .insertInto('web_acquisition_controls')
      .values({
        domain: '*',
        blocked: true,
        reason: 'test-only',
        actor_id: own.userId,
        updated_at: new Date(),
      })
      .execute();
    await expect(
      authorizeAcquisition(db, new URL('https://other.test/page')),
    ).rejects.toMatchObject({ code: 'acquisition_unavailable' });
  } finally {
    await db.deleteFrom('web_acquisition_controls').where('domain', 'in', domains).execute();
  }
  await expect(
    authorizeAcquisition(db, new URL('https://other.test/page')),
  ).resolves.toBeUndefined();
});

it('fails closed before DNS or transport when the policy store cannot answer', async () => {
  const unavailable = db.withSchema('unavailable_acquisition_policy');
  const dns = vi.fn();
  const send = vi.fn();
  const fetcher = createWebsiteFetcher(dns, send);
  await expect(
    fetcher('https://publisher.test/page', {
      maxBytes: 1024,
      timeoutSeconds: 1,
      redirects: 0,
      contentTypes: ['text/html'],
      authorize: (url) => authorizeAcquisition(unavailable, url),
    }),
  ).rejects.toMatchObject({ code: 'acquisition_unavailable' });
  expect(dns).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it('settles only a due post-declaration reading and commits its handoff in the same transaction', async () => {
  const own = await seed();
  await syncPages(db, own.scope, own.audit);
  const claim = (await claimPages(db, own.scope))[0]!;
  const baselinePage = extractSourcePage(
    Buffer.from(`<p>${'Other tools are available. '.repeat(60)}</p>`),
  );
  const fetch = { outcome: 'inspected' as const, requestedUrl: claim.url };
  const baseline = await recordInspection(
    db,
    own.task,
    own.scope,
    claim.id,
    claim.lease,
    fetch,
    own.audit,
    projectRoster(own.configuration),
    baselinePage,
    assessPage(baselinePage, own.configuration),
  );
  const declared = new Date();
  const snapshotId = randomUUID();
  const action = randomUUID();
  const event = randomUUID();
  const checkId = randomUUID();
  await db
    .insertInto('opportunity_snapshots')
    .values({
      id: snapshotId,
      workspace_id: own.workspaceId,
      project_id: own.projectId,
      run_id: randomUUID(),
      analyzer_version: 'test',
      rule_version: 'test',
      formula_version: 'test',
      total_count: 0,
      domain_rollups: '[]',
      limitations: '[]',
      created_at: declared,
    })
    .execute();
  await db
    .insertInto('actions')
    .values({
      id: action,
      workspace_id: own.workspaceId,
      project_id: own.projectId,
      group_key: randomUUID(),
      status: 'open',
      origin: 'opportunity',
      target_kind: 'earned_page',
      target_label: 'Review',
      approach: '',
      skill_id: '',
      diagnosis: '{}',
      families: '[]',
      member_opportunity_ids: '[]',
      opportunity_snapshot_id: snapshotId,
      created_at: declared,
      updated_at: declared,
    })
    .execute();
  await db
    .insertInto('opportunity_implementation_events')
    .values({
      id: event,
      workspace_id: own.workspaceId,
      project_id: own.projectId,
      action_id: action,
      actor_user_id: own.userId,
      opportunity_snapshot_id: snapshotId,
      idempotency_key: event,
      request_fingerprint: 'test',
      member_opportunity_ids: '[]',
      target_site_url_ids: '[]',
      expected_checks: '[]',
      created_at: declared,
      declared_implemented_at: declared,
    })
    .execute();
  await db
    .insertInto('placement_checks')
    .values({
      id: checkId,
      workspace_id: own.workspaceId,
      project_id: own.projectId,
      implementation_event_id: event,
      source_page_id: claim.id,
      url_hash: canonicalIdentity(claim.url).hash,
      opportunity_stable_key: 'test',
      rule_id: 'test',
      expected_change: policy.opportunity.placement.PLACEMENT_CHANGE_BRAND_LISTED,
      expected_detail: JSON.stringify({ brand_name: 'Acme' }),
      baseline_snapshot_id: baseline,
      baseline_roster_version: projectRoster(own.configuration),
      state: 'pending',
      attempts: 0,
      declared_at: declared,
      due_at: declared,
      checker_version: policy.opportunity.placement.PLACEMENT_CHECKER_VERSION,
      created_at: declared,
      updated_at: declared,
    })
    .execute();
  expect(await settlePlacements(db, own.scope)).toBe(0);
  const page = extractSourcePage(
    Buffer.from(`<h1>Acme</h1><p>${'Acme tools are available. '.repeat(60)}</p>`),
  );
  const observation = await recordInspection(
    db,
    own.task,
    own.scope,
    claim.id,
    null,
    fetch,
    own.audit,
    projectRoster(own.configuration),
    page,
    assessPage(page, own.configuration),
  );
  await expect(
    settlePlacements(db, own.scope, new Date(), own.task, async () => {
      throw new Error('queue unavailable');
    }),
  ).rejects.toThrow('queue unavailable');
  expect(
    (
      await db
        .selectFrom('placement_checks')
        .select('state')
        .where('id', '=', checkId)
        .executeTakeFirstOrThrow()
    ).state,
  ).toBe('pending');
  const handoff = vi.fn(async (trx: typeof db) => {
    await enqueueTask(trx, {
      ...own.scope,
      kind: 'opportunity_verification',
      keyParts: [checkId],
      maxAttempts: 2,
      payload: {},
    });
  });
  expect(await settlePlacements(db, own.scope, new Date(), own.task, handoff)).toBe(1);
  const settled = await db
    .selectFrom('placement_checks')
    .selectAll()
    .where('id', '=', checkId)
    .executeTakeFirstOrThrow();
  expect(settled).toMatchObject({
    state: 'satisfied',
    observation_snapshot_id: observation,
    attempts: 1,
    due_at: null,
  });
  expect(await settlePlacements(db, own.scope, new Date(), own.task, handoff)).toBe(0);
  expect(handoff).toHaveBeenCalledTimes(1);
  const absent = extractSourcePage(
    Buffer.from(`<p>${'Other tools are available. '.repeat(60)}</p>`),
  );
  await recordInspection(
    db,
    own.task,
    own.scope,
    claim.id,
    null,
    fetch,
    own.audit,
    projectRoster(own.configuration),
    absent,
    assessPage(absent, own.configuration),
  );
  await db
    .updateTable('placement_checks')
    .set({
      state: 'unmet',
      observation_snapshot_id: null,
      due_at: new Date(),
      attempts: policy.opportunity.placement.PLACEMENT_RECHECK_MAX_ATTEMPTS - 1,
    })
    .where('id', '=', checkId)
    .execute();
  await settlePlacements(db, own.scope);
  expect(
    await db
      .selectFrom('placement_checks')
      .select(['state', 'state_reason', 'due_at'])
      .where('id', '=', checkId)
      .executeTakeFirstOrThrow(),
  ).toEqual({
    state: 'unmet',
    state_reason: policy.opportunity.placement.PLACEMENT_REASON_EXHAUSTED,
    due_at: null,
  });
  const thin = extractSourcePage(Buffer.from('<p>Other tools</p>'));
  await recordInspection(
    db,
    own.task,
    own.scope,
    claim.id,
    null,
    fetch,
    own.audit,
    projectRoster(own.configuration),
    thin,
    assessPage(thin, own.configuration),
  );
  await db
    .updateTable('placement_checks')
    .set({ state: 'pending', observation_snapshot_id: null, due_at: new Date(), attempts: 0 })
    .where('id', '=', checkId)
    .execute();
  const recheckTime = new Date();
  await settlePlacements(db, own.scope, recheckTime);
  const retry = await db
    .selectFrom('placement_checks')
    .selectAll()
    .where('id', '=', checkId)
    .executeTakeFirstOrThrow();
  expect(retry).toMatchObject({
    state: 'unavailable',
    state_reason: policy.opportunity.placement.PLACEMENT_REASON_COVERAGE,
  });
  expect(retry.due_at?.getTime()).toBe(
    recheckTime.getTime() + policy.opportunity.placement.PLACEMENT_RECHECK_INTERVAL_HOURS * 3600000,
  );
  await db
    .updateTable('placement_checks')
    .set({
      state: 'pending',
      observation_snapshot_id: null,
      due_at: new Date(),
      baseline_roster_version: 'changed-roster',
    })
    .where('id', '=', checkId)
    .execute();
  await settlePlacements(db, own.scope);
  expect(
    await db
      .selectFrom('placement_checks')
      .select(['state', 'state_reason', 'due_at'])
      .where('id', '=', checkId)
      .executeTakeFirstOrThrow(),
  ).toEqual({
    state: 'unavailable',
    state_reason: policy.opportunity.placement.PLACEMENT_REASON_ROSTER_CHANGED,
    due_at: null,
  });
});

it('recovers an expired page lease and ignores old spend while charging redirects idempotently', async () => {
  const own = await seed();
  await syncPages(db, own.scope, own.audit);
  const page = await db
    .selectFrom('source_pages')
    .select('id')
    .where('project_id', '=', own.projectId)
    .executeTakeFirstOrThrow();
  const now = new Date();
  await db
    .updateTable('source_pages')
    .set({ inspection_state: 'queued', claim_expires_at: new Date(now.getTime() - 1) })
    .where('id', '=', page.id)
    .execute();
  await db
    .insertInto('source_page_inspection_spend')
    .values({
      id: randomUUID(),
      workspace_id: own.workspaceId,
      project_id: own.projectId,
      source_page_id: null,
      spend_kind: 'page',
      units: policy.source_pages.budget_per_window,
      idempotency_key: randomUUID(),
      created_at: new Date(now.getTime() - (policy.source_pages.budget_window_hours + 1) * 3600000),
    })
    .execute();
  expect(await claimPages(db, own.scope, now, [page.id])).toHaveLength(1);
  const token = 'https://redirect.test/long-token';
  expect(await spendRedirect(db, own.scope, token, now)).toBe('charged');
  expect(await spendRedirect(db, own.scope, token, now)).toBe('duplicate');
  expect(await claimPages(db, own.scope, now, [page.id])).toEqual([]);
});

it('admits never-inspected pages before stale ones and reuses a recent reading', async () => {
  const urls = [
    'https://publisher.test/stale',
    'https://publisher.test/new',
    'https://publisher.test/fresh',
  ];
  const own = await seed(urls);
  await syncPages(db, own.scope, own.audit);
  const ids = new Map(
    (
      await db
        .selectFrom('source_pages')
        .select(['id', 'canonical_url'])
        .where('project_id', '=', own.projectId)
        .execute()
    ).map((row) => [row.canonical_url, row.id]),
  );
  const state = (url: string, values: Record<string, unknown>) =>
    db.updateTable('source_pages').set(values).where('id', '=', ids.get(url)!).execute();
  const now = new Date();
  await state(urls[0]!, {
    inspection_state: 'stale',
    recurrence_count: 99,
    last_inspected_at: null,
  });
  await state(urls[1]!, { inspection_state: 'not_inspected', recurrence_count: 1 });
  await state(urls[2]!, { inspection_state: 'inspected', last_inspected_at: now });
  const claims = await claimPages(db, own.scope, now, [...ids.values()]);
  expect(claims.map((claim) => claim.url)).toEqual([urls[1], urls[0]]);
});

it('selects candidate-audit evidence and keeps missing owned relevance explicitly unknown', async () => {
  const own = await seed([
    'https://publisher.test/one',
    'https://publisher.test/two',
    'https://publisher.test/three',
  ]);
  await syncPages(db, own.scope, own.audit);
  const auditTask = await db
    .selectFrom('audit_tasks')
    .select('id')
    .where('audit_id', '=', own.audit)
    .executeTakeFirstOrThrow();
  const snapshotIds: string[] = [];
  for (const [index, claim] of (await claimPages(db, own.scope)).entries()) {
    const page = extractSourcePage(
      Buffer.from(`<h1>Acme pricing</h1><p>${'Acme pricing is measured. '.repeat(60)}</p>`),
    );
    const snapshot = await recordInspection(
      db,
      own.task,
      own.scope,
      claim.id,
      claim.lease,
      { outcome: 'inspected', requestedUrl: claim.url },
      own.audit,
      projectRoster(own.configuration),
      page,
      assessPage(page, own.configuration),
    );
    snapshotIds.push(snapshot!);
    await db
      .insertInto('content_differentiation_candidates')
      .values({
        id: randomUUID(),
        workspace_id: own.workspaceId,
        project_id: own.projectId,
        audit_id: own.audit,
        audit_task_id: auditTask.id,
        source_page_id: claim.id,
        query_text: 'Acme pricing',
        rank: index + 1,
        result_title: 'Result',
        search_context: '{}',
        created_at: new Date(),
      })
      .execute();
    const original = await db
      .selectFrom('source_page_snapshots')
      .selectAll()
      .where('id', '=', snapshot!)
      .executeTakeFirstOrThrow();
    const laterAudit = await fixtures.audit(own);
    await db
      .insertInto('source_page_snapshots')
      .values({
        ...original,
        id: randomUUID(),
        audit_id: laterAudit,
        fetched_at: new Date(Date.now() + 1000),
        evidence_passages: JSON.stringify(original.evidence_passages),
        page_facts: JSON.stringify(original.page_facts),
        redirect_chain: JSON.stringify(original.redirect_chain),
        redacted_headers: JSON.stringify(original.redacted_headers),
      })
      .execute();
  }
  await refreshDifferentiation(db, own.scope, own.audit, []);
  const report = record(
    (
      await db
        .selectFrom('content_differentiation_reports')
        .select('report')
        .where('audit_task_id', '=', auditTask.id)
        .executeTakeFirstOrThrow()
    ).report,
  );
  expect(report.state).toBe('insufficient_evidence');
  expect(record(report.provenance).snapshot_ids).toEqual(snapshotIds.sort());
  expect(record(report.provenance).inspected_page_count).toBe(3);
  const unrelatedAudit = await fixtures.audit(own);
  const pageIds = (
    await db
      .selectFrom('source_pages')
      .select('id')
      .where('project_id', '=', own.projectId)
      .execute()
  ).map((row) => row.id);
  await refreshDifferentiation(db, own.scope, unrelatedAudit, [pageIds[0]!]);
  const historical = record(
    (
      await db
        .selectFrom('content_differentiation_reports')
        .select('report')
        .where('audit_task_id', '=', auditTask.id)
        .executeTakeFirstOrThrow()
    ).report,
  );
  expect(record(historical.provenance).selected_result_count).toBe(3);
  const foreign = await fixtures.tenant();
  await refreshDifferentiation(
    db,
    { workspaceId: foreign.workspaceId, projectId: own.projectId },
    own.audit,
    [],
  );
  expect(
    await db
      .selectFrom('content_differentiation_reports')
      .select('id')
      .where('audit_task_id', '=', auditTask.id)
      .execute(),
  ).toHaveLength(1);
});

it('replaces URL format evidence with page evidence and preserves stronger publisher declarations', async () => {
  const own = await seed(['https://publisher.test/best-tools']);
  await syncPages(db, own.scope, own.audit);
  const claim = (await claimPages(db, own.scope))[0]!;
  const persist = async (html: string, lease: Date | null) => {
    const page = extractSourcePage(Buffer.from(html));
    await recordInspection(
      db,
      own.task,
      own.scope,
      claim.id,
      lease,
      { outcome: 'inspected', requestedUrl: claim.url },
      own.audit,
      projectRoster(own.configuration),
      page,
      assessPage(page, own.configuration),
    );
  };
  await persist(
    '<script type="application/ld+json">{"@type":"Article"}</script><h1>Best tools</h1>',
    claim.lease,
  );
  await persist('<h1>Best tools reviewed</h1>', null);
  await persist('<h1>Notes</h1>', null);
  expect(
    await db
      .selectFrom('source_pages')
      .select(['page_format', 'page_format_method'])
      .where('id', '=', claim.id)
      .executeTakeFirstOrThrow(),
  ).toEqual({ page_format: 'article', page_format_method: 'structured_data' });
  await persist(
    '<script type="application/ld+json">{"@type":"ItemList"}</script><h1>Best tools</h1>',
    null,
  );
  expect(
    (
      await db
        .selectFrom('source_pages')
        .select('page_format')
        .where('id', '=', claim.id)
        .executeTakeFirstOrThrow()
    ).page_format,
  ).toBe('listicle');
});
