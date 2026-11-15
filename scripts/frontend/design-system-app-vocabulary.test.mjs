import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appVocabularyViolations } from '../../frontend/scripts/design-system-app-vocabulary.mjs';

const COLOUR =
  "the app's colours are ground, surface, well, raised, rule, rule-ink, control-line, ink, ink-2 and their roles";
const RADIUS =
  "the app's radii are rounded-mark, -sm, -control, -card, -overlay, -sheet and -full";
const TYPE = "the website's type role; the app uses its own (components/ui/typography.tsx)";

test("app code uses the app's names; website variants, atoms and pages are exempt", () => {
  const app = 'components/visibility/overview.tsx';
  const cases = [
    { source: '<div className="bg-paper" />', label: app, owns: true, expected: [COLOUR] },
    {
      source: '<div className="hover:border-b-line-strong/50" />',
      label: app,
      owns: true,
      expected: [COLOUR],
    },
    {
      source: '.row { color: var(--color-ink-muted); }',
      label: 'apps/app/src/row.css',
      owns: true,
      expected: [COLOUR],
    },
    { source: '<div className="rounded-t-lg" />', label: app, owns: true, expected: [RADIUS] },
    {
      source: '<h2 className="type-page-title bg-surface-sunken" />',
      label: app,
      owns: true,
      expected: [COLOUR, TYPE],
    },
    {
      source: '<div className="bg-surface text-ink-2 border-rule rounded-control" />',
      label: app,
      owns: true,
      expected: [],
    },
    {
      source: '<div className="[[data-public-surface]_&]:bg-paper" />',
      label: app,
      owns: true,
      expected: [],
    },
    { source: '/* bg-paper */ <div />', label: app, owns: true, expected: [] },
    {
      source: '<div className="rounded-lg" />',
      label: 'components/ui/tabs.tsx',
      owns: true,
      expected: [],
    },
    {
      source: '<h2 className="type-page-title" />',
      label: 'components/ui/typography.tsx',
      owns: true,
      expected: [],
    },
    {
      source: '<div className="bg-paper" />',
      label: 'components/ui/card.tsx',
      owns: true,
      expected: [],
    },
    {
      source: '<div className="bg-paper" />',
      label: 'components/content/article.tsx',
      owns: true,
      expected: [],
    },
    {
      source: '<div className="bg-paper" />',
      label: 'components/visibility/overview.test.tsx',
      owns: true,
      expected: [],
    },
    {
      source: '.a { color: var(--color-paper); }',
      label: 'apps/app/src/globals.css',
      owns: true,
      expected: [],
    },
    {
      source: '<div className="bg-paper" />',
      label: 'components/marketing/hero.tsx',
      owns: false,
      expected: [],
    },
  ];
  for (const { source, label, owns, expected } of cases) {
    assert.deepEqual(
      appVocabularyViolations(source, label, owns),
      expected.map((message) => `${label}: ${message}`),
      `${label}: ${source}`,
    );
  }
});
