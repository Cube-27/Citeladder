/**
 * The `content_gaps` refresh family and the Action surface against real
 * PostgreSQL: which angles become gaps, where their Actions land, retention
 * across failed, empty and old runs, lineage identity, planned-to-owned
 * continuity and workspace isolation. Angle runs are seeded directly; nothing
 * calls a model.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { actionSurface } from '../src/analysis/opportunities/actions.ts';
import { record } from '../src/db/json.ts';
import { attachOrCreateAction, listActions } from '../src/opportunities/actions.ts';
import { declareAction } from '../src/opportunities/declarations.ts';
import { recomputeOpportunities } from '../src/opportunities/refresh.ts';
import { angleRun, type AngleSeed } from './opportunity-fixtures.ts';
import { SiteFixtures, storedFacts, type SiteSeed } from './site-health-fixtures.ts';
import { testDatabase } from './support.ts';

const db = testDatabase();
const fixtures = new SiteFixtures(db);
const projects: Project[] = [];
const DAY = 86_400_000;
const PAGE_URL = 'https://example.test/crm-pricing';

afterAll(async () => {
  const workspaces = projects.map((p) => p.workspaceId);
  for (const table of [
    'opportunity_implementation_events',
    'action_status_events',
    'opportunities',
    'actions',
    'opportunity_snapshots',
    'analytics_tasks',
  ] as const)
    await db.deleteFrom(table).where('workspace_id', 'in', workspaces).execute();
  await fixtures.cleanup();
  await db.destroy();
});

type Project = SiteSeed & { pageId: string };

/** A crawled project with one content page (a comparison) at PAGE_URL. */
async function project(): Promise<Project> {
  const seed = await fixtures.crawl();
  const page = await fixtures.page(seed, '/crm-pricing', storedFacts({ title: 'CRM pricing' }));
  await db
    .updateTable('site_page_analyses')
    .set({ page_kind: 'comparison' })
    .where('workspace_id', '=', seed.workspaceId)
    .where('id', '=', page.analysisId)
    .execute();
  const created = { ...seed, pageId: page.id };
  projects.push(created);
  return created;
}

const scopeOf = (p: Project) => ({ workspaceId: p.workspaceId, projectId: p.projectId });

// Four citations across two domains: above both placeholder thresholds.
const PRICING = [
  { url: 'https://globex.com/pricing', title: 'Globex pricing', competitor: true },
  { url: 'https://review.example/crm-pricing', title: 'CRM pricing compared' },
];
const SETUP = [
  { url: 'https://globex.com/setup', title: 'Globex setup guide', competitor: true },
  { url: 'https://news.example/crm-setup', title: 'How to set up a CRM' },
];

const improve = (p: Project, extra: Partial<AngleSeed> = {}): AngleSeed => ({
  label: 'Pricing comparison',
  siteUrlId: p.pageId,
  members: PRICING,
  ...extra,
});
const create = (extra: Partial<AngleSeed> = {}): AngleSeed => ({
  label: 'Setup guide',
  members: SETUP,
  ...extra,
});

const run = (p: Project, options: Parameters<typeof angleRun>[2]) =>
  angleRun(db, scopeOf(p), options);

/** The live content-gap findings, as [rule, target key, Action id]. */
async function gaps(p: Project) {
  const rows = await db
    .selectFrom('opportunities')
    .select(['rule_id', 'target_key', 'action_id', 'evidence'])
    .where('workspace_id', '=', p.workspaceId)
    .where('rule_id', 'like', 'content_gap_%')
    .where('superseded_at', 'is', null)
    .orderBy('rule_id')
    .execute();
  return rows;
}

async function actions(p: Project) {
  return db
    .selectFrom('actions')
    .select([
      'id',
      'target_kind',
      'target_label',
      'surface',
      'origin',
      'evidence_cleared_at',
      'member_opportunity_ids',
    ])
    .where('workspace_id', '=', p.workspaceId)
    .orderBy('target_kind')
    .orderBy('target_label')
    .execute();
}

async function plannedKeys(p: Project, lineages: string[]) {
  const rows = await db
    .selectFrom('content_angle_lineages')
    .select(['id', 'planned_page_key'])
    .where('workspace_id', '=', p.workspaceId)
    .where('id', 'in', lineages)
    .execute();
  return lineages.map((id) => rows.find((row) => row.id === id)?.planned_page_key);
}

describe('content gaps', () => {
  it('raises improve-page and new-page gaps onto the Content surface and fixes the planned key', async () => {
    const p = await project();
    const { runId, lineages } = await run(p, {
      angles: [
        improve(p),
        create(),
        // Covered: the matched page is already cited for the angle's prompts.
        improve(p, { label: 'Pricing tiers', ownedCited: true }),
        // Below the domain minimum.
        { label: 'Thin', members: [{ url: 'https://solo.example/a', title: 'A', citations: 5 }] },
      ],
    });
    await recomputeOpportunities(db, scopeOf(p));

    const found = await gaps(p);
    expect(found.map((row) => [row.rule_id, row.target_key])).toEqual([
      ['content_gap_improve_page', `url:${PAGE_URL}`],
      ['content_gap_new_page', 'planned:setup-guide'],
    ]);
    expect(record(found[1]!.evidence)).toMatchObject({
      run_id: runId,
      lineage_id: lineages[1],
      angle_label: 'Setup guide',
      citation_count: 4,
      domain_count: 2,
      competitor_count: 1,
      planned_page_key: 'planned:setup-guide',
      members: [
        expect.objectContaining({ url: 'https://globex.com/setup', citation_count: 2 }),
        expect.objectContaining({ url: 'https://news.example/crm-setup', citation_count: 2 }),
      ],
    });
    expect(
      (await actions(p)).map((row) => [row.target_kind, row.target_label, row.surface]),
    ).toEqual([
      ['page', PAGE_URL, 'content'],
      ['planned_page', 'Setup guide', 'content'],
    ]);
    // Only the lineage that raised a new-page gap has its key, written at the refresh.
    expect(await plannedKeys(p, lineages)).toEqual([null, 'planned:setup-guide', null, null]);
  });

  it('moves a page Action to Actions when the next crawl no longer reads it as content', async () => {
    const p = await project();
    await run(p, { angles: [improve(p)] });
    await recomputeOpportunities(db, scopeOf(p));
    const [before] = await actions(p);
    expect(before?.surface).toBe('content');

    const crawlId = await fixtures.sibling(p);
    const page = await fixtures.page({ ...p, crawlId }, '/crm-pricing', storedFacts(), {
      siteUrlId: p.pageId,
    });
    await db
      .updateTable('site_page_analyses')
      .set({ page_kind: 'pricing' })
      .where('workspace_id', '=', p.workspaceId)
      .where('id', '=', page.analysisId)
      .execute();
    await recomputeOpportunities(db, scopeOf(p), { skipIfCurrent: true });
    expect((await actions(p)).map((row) => [row.id, row.surface])).toEqual([
      [before!.id, 'actions'],
    ]);
  });

  it('keeps gaps after a failed run and clears them on a succeeded run with none', async () => {
    const p = await project();
    await run(p, { angles: [improve(p)] });
    const first = await recomputeOpportunities(db, scopeOf(p));
    const [action] = await actions(p);

    await run(p, { outcome: 'failed' });
    const afterFailure = await recomputeOpportunities(db, scopeOf(p), { skipIfCurrent: true });
    expect(afterFailure.id).toBe(first.id);
    expect((await gaps(p)).map((row) => row.action_id)).toEqual([action!.id]);

    await run(p, { angles: [] });
    await recomputeOpportunities(db, scopeOf(p), { skipIfCurrent: true });
    expect(await gaps(p)).toEqual([]);
    const [cleared] = await actions(p);
    expect([cleared?.id, cleared?.member_opportunity_ids]).toEqual([action!.id, []]);
    expect(cleared?.evidence_cleared_at).toBeInstanceOf(Date);
    const listed = await listActions(db, scopeOf(p), {
      status: null,
      target_kind: null,
      surface: 'content',
      limit: 10,
      cursor: null,
    });
    expect(listed.items).toEqual([]);
    // A current run with no gaps: a real "no gaps", not "not computed yet".
    expect(listed.content_gap_source).toBe('current');
  });

  it('says when gaps were never computed, and clears gaps whose run is out of date', async () => {
    const p = await project();
    const source = async () =>
      (
        await listActions(db, scopeOf(p), {
          status: null,
          target_kind: null,
          surface: 'content',
          limit: 10,
          cursor: null,
        })
      ).content_gap_source;
    expect(await source()).toBe('not_computed');
    const never = await recomputeOpportunities(db, scopeOf(p));
    expect(never.limitations).toContain('Content gaps not computed yet.');
    expect(await source()).toBe('not_computed');

    const { runId } = await run(p, { angles: [improve(p)] });
    await recomputeOpportunities(db, scopeOf(p));
    expect(await gaps(p)).toHaveLength(1);
    expect(await source()).toBe('current');

    // Time passes: the run's newest audit is now 46 days old.
    await db
      .updateTable('content_angle_runs')
      .set({ window_end: new Date(Date.now() - 46 * DAY) })
      .where('id', '=', runId)
      .execute();
    const stale = await recomputeOpportunities(db, scopeOf(p), { skipIfCurrent: true });
    expect(await gaps(p)).toEqual([]);
    expect(stale.limitations).toContain(
      'Content-gap evidence is out of date: its newest audit is more than 45 days old.',
    );
    expect(await source()).toBe('out_of_date');

    // A snapshot written under an earlier max_source_age_days still reads out of date.
    await db
      .updateTable('opportunity_snapshots')
      .set({
        limitations: JSON.stringify([
          'Content-gap evidence is out of date: its newest audit is more than 30 days old.',
        ]),
      })
      .where('workspace_id', '=', p.workspaceId)
      .where('project_id', '=', p.projectId)
      .execute();
    expect(await source()).toBe('out_of_date');
  });

  it('keeps the Action and planned key of a relabelled angle', async () => {
    const p = await project();
    const { lineages } = await run(p, { angles: [create()] });
    await recomputeOpportunities(db, scopeOf(p));
    const [planned] = await actions(p);

    await run(p, {
      angles: [create({ label: 'CRM onboarding checklist', lineageId: lineages[0] })],
    });
    await recomputeOpportunities(db, scopeOf(p));
    expect((await gaps(p)).map((row) => [row.target_key, row.action_id])).toEqual([
      ['planned:setup-guide', planned!.id],
    ]);
    expect((await actions(p)).map((row) => [row.id, row.target_label])).toEqual([
      [planned!.id, 'CRM onboarding checklist'],
    ]);
    expect(await plannedKeys(p, lineages)).toEqual(['planned:setup-guide']);
  });

  it('converges an Agent planned page with the gap that names it, and leaves others on Actions', async () => {
    const p = await project();
    const attach = (kind: string, target: string) =>
      db
        .transaction()
        .execute((trx) => attachOrCreateAction(trx, scopeOf(p), kind, target, p.userId));
    const agent = await attach('planned_page', 'Setup guide');
    const other = await attach('planned_page', 'Pricing calculator');
    expect([agent.surface, other.surface]).toEqual(['actions', 'actions']);

    await run(p, { angles: [create()] });
    await recomputeOpportunities(db, scopeOf(p));
    expect(
      (await actions(p)).map((row) => [row.id, row.origin, row.target_kind, row.surface]),
    ).toEqual([
      [other.id, 'agent', 'planned_page', 'actions'],
      [agent.id, 'agent', 'planned_page', 'content'],
    ]);
    // The Agent's page Action on a content page reads as content from the snapshot's crawl.
    expect((await attach('page', PAGE_URL)).surface).toBe('content');
  });

  it('keeps a planned page raised by any other rule, or by nobody, on Actions', () => {
    const planned = { kind: 'planned_page', group_key: 'planned:trail-socks' };
    expect(actionSurface(planned, ['search_keyword_gap'], new Set())).toBe('actions');
    expect(actionSurface(planned, [], new Set())).toBe('actions');
    expect(actionSurface(planned, ['search_keyword_gap', 'content_gap_new_page'], new Set())).toBe(
      'content',
    );
  });

  it('continues a declared planned page on the content page that later covers it', async () => {
    const p = await project();
    const { lineages } = await run(p, { angles: [create()] });
    await recomputeOpportunities(db, scopeOf(p));
    const [planned] = await actions(p);
    await declareAction(
      db,
      { workspaceId: p.workspaceId, projectId: null },
      planned!.id,
      p.userId,
      'planned',
      {
        output_revision_id: null,
        declared_implemented_at: new Date(Date.now() - DAY).toISOString(),
      },
    );

    await run(p, { angles: [create({ lineageId: lineages[0], siteUrlId: p.pageId })] });
    await recomputeOpportunities(db, scopeOf(p));
    const found = await gaps(p);
    expect(found.map((row) => row.rule_id)).toEqual(['content_gap_improve_page']);
    expect(record(found[0]!.evidence).continues_action_id).toBe(planned!.id);
    const after = await actions(p);
    const kept = after.find((row) => row.id === planned!.id);
    expect([kept?.target_kind, kept?.member_opportunity_ids]).toEqual(['planned_page', []]);
    expect(kept?.evidence_cleared_at).toBeInstanceOf(Date);
    const declarations = await db
      .selectFrom('opportunity_implementation_events')
      .select('action_id')
      .where('workspace_id', '=', p.workspaceId)
      .execute();
    expect(declarations).toEqual([{ action_id: planned!.id }]);
  });

  it('filters and counts by surface within one workspace', async () => {
    const own = await project();
    const foreign = await project();
    for (const p of [own, foreign]) {
      await run(p, { angles: [improve(p), create()] });
      await db
        .transaction()
        .execute((trx) =>
          attachOrCreateAction(trx, scopeOf(p), 'planned_page', 'Pricing calculator', p.userId),
        );
      await recomputeOpportunities(db, scopeOf(p));
    }
    const list = (surface: string) =>
      listActions(db, scopeOf(own), {
        status: null,
        target_kind: null,
        surface,
        limit: 10,
        cursor: null,
      });
    const content = await list('content');
    const rest = await list('actions');
    const ownIds = new Set((await actions(own)).map((row) => row.id));
    expect(content.items.map((item) => [item.target_kind, item.surface]).sort()).toEqual([
      ['page', 'content'],
      ['planned_page', 'content'],
    ]);
    // Each row carries its angle and counts from the finding's evidence.
    expect(
      content.items
        .map((item) =>
          item.content_gaps.map(({ opportunity_id: _id, ...gap }) => [item.target_kind, gap]),
        )
        .flat()
        .sort(),
    ).toEqual([
      [
        'page',
        {
          rule_id: 'content_gap_improve_page',
          angle_label: 'Pricing comparison',
          prompt_count: 1,
          citation_count: 4,
          domain_count: 2,
          competitor_count: 1,
        },
      ],
      [
        'planned_page',
        {
          rule_id: 'content_gap_new_page',
          angle_label: 'Setup guide',
          prompt_count: 1,
          citation_count: 4,
          domain_count: 2,
          competitor_count: 1,
        },
      ],
    ]);
    expect(content.content_gap_source).toBe('current');
    expect(rest.items.map((item) => [item.target_label, item.surface, item.content_gaps])).toEqual([
      ['Pricing calculator', 'actions', []],
    ]);
    expect(rest.content_gap_source).toBeNull();
    expect([...content.items, ...rest.items].every((item) => ownIds.has(item.id))).toBe(true);
    expect([content.status_counts.open, rest.status_counts.open]).toEqual([2, 1]);
  });
});
