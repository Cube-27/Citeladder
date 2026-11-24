import { describe, expect, it } from 'vitest';

import { analyzePage } from '../src/site-health/analysis/analyze-page.ts';
import { extractPageFacts } from '../src/site-health/analysis/facts.ts';
import { evaluatePageRules, type RuleEvaluation } from '../src/site-health/analysis/rules.ts';
import { MeasurementFold } from '../src/site-health/analysis/measurement-aggregation.ts';
import { scoreAnalysis } from '../src/site-health/analysis/scoring.ts';

const context = { sitemapMember: false, siteFacts: null, auditTime: null };
const facts = (html: string, url: string) =>
  extractPageFacts(Buffer.from(html), {
    finalUrl: url,
    contentType: 'text/html',
    statusCode: 200,
    ttfbMs: 120,
  });
const byRule = (rows: RuleEvaluation[]) => new Map(rows.map((row) => [row.rule_id, row]));

describe('a full score needs every applicable check evaluated and passed', () => {
  it('fails the checks a client-rendered page cannot meet in its server HTML', () => {
    const links = Array.from({ length: 40 }, (_, i) => `<a href="/c/${i}">Dept ${i} sale</a>`);
    const chrome = (main: string) =>
      analyzePage(
        facts(
          `<!doctype html><html><head><title></title></head><body>
          <header><nav>${links.slice(0, 20).join('')}</nav></header>
          <main>${main}</main>
          <footer>${links.slice(20).join('')}<h2>Join our</h2></footer>
          <script src="/main.js" type="module"></script></body></html>`,
          'https://example.test/store/Capalaba',
        ),
        context,
      );
    const shell = byRule(chrome('').evaluations);
    expect(
      ['technical.title_present', 'technical.h1_present', 'technical.meta_description_present'].map(
        (id) => [shell.get(id)?.outcome, shell.get(id)?.reason_code],
      ),
    ).toEqual([
      ['missing', ''],
      ['missing', 'client_rendering_required'],
      ['missing', ''],
    ]);
    expect(shell.get('aeo.server_rendered_content')?.outcome).toBe('missing');

    const thin = byRule(chrome('<h1>Capalaba</h1><p>Open today 9am</p>').evaluations);
    expect([
      thin.get('aeo.server_rendered_content')?.outcome,
      thin.get('technical.title_present')?.outcome,
    ]).toEqual(['satisfied', 'missing']);
  });

  it('scores a store page without its expected LocalBusiness schema below one that carries it', () => {
    const copy = Array.from({ length: 30 }, (_, i) => `Capalaba store detail ${i}.`).join(' ');
    const store = (schema: Record<string, unknown> | null) =>
      analyzePage(
        facts(
          `<!doctype html><html lang="en"><head><title>Capalaba store</title>
          <meta name="viewport" content="width=device-width">
          <link rel="canonical" href="https://example.test/store/Capalaba">
          ${schema ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...schema })}</script>` : ''}
          </head><body><main><h1>Capalaba</h1><p>${copy}</p></main></body></html>`,
          'https://example.test/store/Capalaba',
        ),
        context,
      );
    const none = store(null);
    const partial = store({ '@type': 'LocalBusiness', name: 'Capalaba' });
    const complete = store({
      '@type': 'LocalBusiness',
      name: 'Capalaba',
      address: '1 Redland Bay Rd, Capalaba QLD',
    });
    expect(byRule(none.evaluations).get('aeo.schema_required_valid')).toMatchObject({
      outcome: 'missing',
      reason_code: 'expected_schema_absent',
    });
    const score = (page: typeof none) => page.scores.aeo_readiness_score!;
    expect([none, partial, complete].map((page) => score(page).toFixed(2))).toEqual([
      '52.78',
      '58.33',
      '62.50',
    ]);
    expect(
      complete.scores.expected_checkpoint_profile
        .filter((item) => item.outcome === 'unknown')
        .map((item) => [item.check_id, item.reason]),
    ).toEqual([
      ['technical.canonical_integrity', 'crawl_not_finalized'],
      ...[
        'technical.robots_txt_present',
        'technical.ai_crawler_access',
        'search.crawler_access',
        'aeo.organization_identity',
        'aeo.entity_profiles',
        'aeo.trust_path_present',
        'technical.http_redirects_to_https',
      ].map((id) => [id, 'site_facts_unavailable']),
    ]);
    expect(complete.scores.web_fundamentals_score).toBeLessThan(100);
  });

  it.each([
    ['technical.h1_present', 'web_fundamentals_score'],
    ['technical.meta_description_present', 'web_fundamentals_score'],
    ['aeo.open_graph_present', 'aeo_readiness_score'],
    ['aeo.structured_data_present', 'aeo_readiness_score'],
  ] as const)('drops a page below 100 when only %s fails', (failing, score) => {
    const rows = evaluatePageRules({
      has_html: true,
      page_kind: 'article',
      authored_content: true,
    }).filter((row) => row.outcome !== 'not_applicable');
    const scored = (outcomeOf: (id: string) => string) =>
      scoreAnalysis(
        rows.map((row) => ({ ...row, outcome: outcomeOf(row.rule_id) })),
        'article',
      )[score];
    expect([
      scored(() => 'satisfied'),
      scored((id) => (id === failing ? 'missing' : 'satisfied'))! < 100,
    ]).toEqual([100, true]);
  });

  it('keeps a page with an unevaluated scored check below 100 while keeping it unknown', () => {
    const row = (rule_id: string, outcome: string) => ({
      ...evaluatePageRules({ has_html: true }).find((item) => item.rule_id === rule_id)!,
      outcome,
    });
    const scored = scoreAnalysis(
      [row('technical.https', 'satisfied'), row('technical.title_present', 'unknown')],
      'other',
    );
    expect([
      scored.web_fundamentals_score,
      scored.web_fundamentals_coverage,
      scored.web_fundamentals_state,
    ]).toEqual([50, 0.5, 'limited_evidence']);
    expect(
      scored.expected_checkpoint_profile.find((item) => item.check_id === 'technical.title_present')
        ?.outcome,
    ).toBe('unknown');
  });

  it('counts the checks that ran out of those that apply across a crawl', () => {
    const row = (rule_id: string, outcome: string) => ({
      ...evaluatePageRules({ has_html: true }).find((item) => item.rule_id === rule_id)!,
      outcome,
    });
    const fold = new MeasurementFold([]);
    for (const [title, snippet] of [
      ['unknown', 'unknown'],
      ['missing', 'satisfied'],
    ])
      fold.add({
        page_kind: 'other',
        evaluations: [
          row('technical.https', 'satisfied'),
          row('technical.title_present', title!),
          row('search.snippet_access', snippet!),
        ],
      });
    const { web_fundamentals_checks: web, aeo_readiness_checks: aeo } = fold.aggregate();
    expect([web, aeo, fold.byPageKind().other?.web_fundamentals_checks]).toEqual([
      { run: 3, total: 4 },
      { run: 1, total: 2 },
      { run: 3, total: 4 },
    ]);
  });

  it('weights the headline by each page kind’s share of the site’s known URLs', () => {
    const row = (outcome: string) => ({
      ...evaluatePageRules({ has_html: true }).find((item) => item.rule_id === 'technical.https')!,
      outcome,
    });
    const fold = new MeasurementFold([]);
    for (const [kind, outcome] of [
      ['local', 'missing'],
      ['local', 'missing'],
      ['local', 'missing'],
      ['product', 'satisfied'],
    ] as const)
      fold.add({ page_kind: 'other', url_kind: kind, evaluations: [row(outcome)] });
    expect(fold.aggregate(new Map()).web_fundamentals_score).toBe(25);
    expect(fold.weighting(new Map())).toEqual({ kind: 'sample_average' });
    const known = new Map([
      ['local', 1],
      ['product', 9],
      ['article', 10],
    ]);
    expect(fold.aggregate(known).web_fundamentals_score).toBe(90);
    expect(fold.weighting(known)).toEqual({
      kind: 'site_share',
      known_url_count: 20,
      strata: [
        {
          page_kind: 'article',
          known_url_count: 10,
          analyzed_count: 0,
          web_fundamentals_score: null,
          aeo_readiness_score: null,
        },
        {
          page_kind: 'product',
          known_url_count: 9,
          analyzed_count: 1,
          web_fundamentals_score: 100,
          aeo_readiness_score: null,
        },
        {
          page_kind: 'local',
          known_url_count: 1,
          analyzed_count: 3,
          web_fundamentals_score: 0,
          aeo_readiness_score: null,
        },
      ],
    });
  });

  it('keeps a crawl below 100 when an applicable page had no check run', () => {
    const row = (rule_id: string, outcome: string) => ({
      ...evaluatePageRules({ has_html: true }).find((item) => item.rule_id === rule_id)!,
      outcome,
    });
    const fold = new MeasurementFold([]);
    fold.add({ page_kind: 'other', evaluations: [row('technical.https', 'satisfied')] });
    fold.add({ page_kind: 'other', evaluations: [row('technical.https', 'unknown')] });
    expect([
      fold.aggregate().web_fundamentals_score,
      fold.byPageKind().other?.web_fundamentals_score,
    ]).toEqual([50, 50]);
  });
});
