import { expect, it } from 'vitest';

import { WebDiagnosticFold } from '../src/site-health/snapshot-diagnostics.ts';

type Rows = Parameters<WebDiagnosticFold['addEvaluations']>[0];

const row = (rule_id: string, outcome: string) => ({ rule_id, outcome });

it('breaks the Web fundamentals score down by the category of every rule that scores it', () => {
  const fold = new WebDiagnosticFold();
  fold.addEvaluations([
    row('technical.canonical_present', 'satisfied'),
    row('technical.canonical_present', 'missing'),
    row('technical.title_present', 'missing'),
    row('technical.ttfb_band', 'satisfied'),
    row('architecture.excessive_depth', 'missing'),
  ] as unknown as Rows);

  const areas = fold.result([]).areas.map((area) => ({
    key: area.key,
    passed: area.passed_count,
    missing: area.missing_count,
    findings: area.top_findings.map((finding) => finding.rule_id),
  }));

  expect(areas).toEqual([
    { key: 'indexability', passed: 1, missing: 1, findings: ['technical.canonical_present'] },
    { key: 'metadata', passed: 0, missing: 1, findings: ['technical.title_present'] },
    { key: 'content', passed: 0, missing: 0, findings: [] },
    { key: 'performance', passed: 1, missing: 0, findings: [] },
    { key: 'security', passed: 0, missing: 0, findings: [] },
  ]);
});
