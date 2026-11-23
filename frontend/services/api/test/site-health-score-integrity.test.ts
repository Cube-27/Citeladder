import { describe, expect, it } from 'vitest';

import { analyzePage } from '../src/site-health/analysis/analyze-page.ts';
import { extractPageFacts } from '../src/site-health/analysis/facts.ts';
import { evaluatePageRules, type RuleEvaluation } from '../src/site-health/analysis/rules.ts';
import { scoreAnalysis } from '../src/site-health/analysis/scoring.ts';

const context = { sitemapMember: false, siteFacts: null, auditTime: null };
const facts = (html: string, url: string) =>
  extractPageFacts(Buffer.from(html), { finalUrl: url, contentType: 'text/html', statusCode: 200 });
const byRule = (rows: RuleEvaluation[]) => new Map(rows.map((row) => [row.rule_id, row]));

describe('a full score needs every applicable check evaluated and passed', () => {
  it('treats chrome-only pages that load content from external bundles as unrendered, not as defects', () => {
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
    ).toEqual(Array(3).fill(['unknown', 'client_rendering_required']));
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
    expect([none, partial, complete].map(score)).toEqual([80, 260 / 3, 100]);
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
});
