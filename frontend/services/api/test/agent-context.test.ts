import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabase } from './support.ts';
import { SiteFixtures } from './site-health-fixtures.ts';
import { readAgentContext } from '../src/agent/context-adapter.ts';
import { selectContentFragments } from '../src/site-health/reads/content-fragments.ts';

describe('Agent persisted context binding', () => {
  const db = testDatabase(),
    fixtures = new SiteFixtures(db);
  afterAll(async () => {
    await fixtures.cleanup();
    await db.destroy();
  });
  it('falls back past factless terminal crawls and ranks an explicit target before lexical matches and brand background', async () => {
    const seed = await fixtures.crawl();
    const home = await fixtures.page(seed, '/', {
      title: 'Home',
      body: { text: 'Brand background' },
    });
    const relevant = await fixtures.page(seed, '/pricing', {
      title: 'Pricing guide',
      body: { text: 'Costs pricing plans' },
    });
    const target = await fixtures.page(seed, '/product', {
      title: 'Product\u0001 title',
      headings: { h1_texts: ['Product heading'] },
      body: { text: 'Current\nproduct content' },
    });
    await db
      .updateTable('site_page_analyses')
      .set({ finalized_at: new Date() })
      .where('workspace_id', '=', seed.workspaceId)
      .where('crawl_id', '=', seed.crawlId)
      .execute();
    const emptyId = await fixtures.sibling(seed, { created_at: new Date(Date.now() + 1000) });
    await fixtures.page({ ...seed, crawlId: emptyId }, '/empty', {});
    await db
      .updateTable('site_page_analyses')
      .set({ finalized_at: new Date() })
      .where('workspace_id', '=', seed.workspaceId)
      .where('crawl_id', '=', emptyId)
      .execute();
    const selection = await selectContentFragments(
      db,
      seed,
      'pricing guide',
      'http://example.test/product/',
    );
    expect(selection.pages.map((page) => page.site_url_id)).toEqual([
      target.id,
      relevant.id,
      home.id,
    ]);
    expect(selection.pages[0]).toMatchObject({
      title: 'Product title',
      body_text: 'Current product content',
    });
    expect(selection.summary).toMatchObject({
      crawl_id: seed.crawlId,
      provenance: [
        { artifact_id: target.artifactId, analysis_id: target.analysisId },
        { artifact_id: relevant.artifactId },
        {},
      ],
    });
    const context = await readAgentContext(
      db,
      { ...seed, userId: seed.userId },
      { target_site_url_id: target.id },
      'pricing guide',
    );
    expect(context.target_page_block).toContain('Current product content');
    expect(context.summary).toMatchObject({
      target_url: 'https://example.test/product',
      crawl_page_count: 3,
      related_page_count: 2,
    });
  });
  it('refuses explicit origins from a sibling project and records absent crawl evidence', async () => {
    const seed = await fixtures.crawl(),
      foreign = await fixtures.crawl();
    const page = await fixtures.page(foreign, '/foreign', { title: 'Private page' });
    const scope = { ...seed, userId: seed.userId };
    const origins: Record<string, string>[] = [
      { target_site_url_id: page.id },
      { opportunity_id: randomUUID() },
      { demand_signal_id: randomUUID() },
    ];
    for (const refs of origins)
      await expect(readAgentContext(db, scope, refs, 'Write')).rejects.toMatchObject({
        code: 'agent_context_unavailable',
      });
    const context = await readAgentContext(db, scope, {}, 'Write');
    expect(context.summary).toMatchObject({
      omissions: [{ reason: 'no_usable_crawl' }],
      crawl_page_count: 0,
    });
    expect(context.related_site_block).toBe('');
  });
  it('resolves an exact readiness gap to finalized evidence and refuses a conflicting target', async () => {
    const seed = await fixtures.crawl();
    const page = await fixtures.page(seed, '/product', { title: 'Product' }),
      other = await fixtures.page(seed, '/other', { title: 'Other' });
    const evaluationId = await fixtures.evaluation(
      seed,
      page,
      'technical.title_present',
      'missing',
    );
    await db
      .updateTable('site_rule_evaluations')
      .set({ evidence: JSON.stringify({ title: '', meta_description: 'Captured fallback' }) })
      .where('id', '=', evaluationId)
      .execute();
    await db
      .updateTable('site_page_analyses')
      .set({ finalized_at: new Date(), source_artifact_ids: [page.artifactId] })
      .where('workspace_id', '=', seed.workspaceId)
      .where('id', '=', page.analysisId)
      .execute();
    const ref = {
      project_id: seed.projectId,
      crawl_id: seed.crawlId,
      site_url_id: page.id,
      source_analysis_id: page.analysisId,
      dimension: 'metadata',
      checkpoint_ids: ['technical.title_present'],
    };
    const context = await readAgentContext(db, seed, { site_health_reference: ref }, 'Fix title');
    expect(context.summary.site_health_reference).toMatchObject({
      source_analysis_id: page.analysisId,
      source_evaluation_ids: [evaluationId],
      source_artifact_ids: [page.artifactId],
      target_fields: ['title'],
      suggested_skill_id: 'content_page',
      captured_values: ['Captured fallback'],
    });
    await expect(
      readAgentContext(
        db,
        seed,
        { site_health_reference: ref, target_site_url_id: other.id },
        'Fix title',
      ),
    ).rejects.toMatchObject({ code: 'agent_context_conflict' });
    const foreign = await fixtures.crawl();
    await expect(
      readAgentContext(db, foreign, { site_health_reference: ref }, 'Fix title'),
    ).rejects.toMatchObject({ code: 'agent_context_unavailable' });
  });
});
