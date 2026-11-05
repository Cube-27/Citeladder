import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reviewScriptFindings, reviewStylesheetFindings } from './design-system-review-checks.mjs';

const tsx = (className) => `export const X = () => <p className="${className}">x</p>;\n`;

test('D6: a heavier-than-500 weight fails in the app, docs and ui, never on the website', () => {
  assert.deepEqual(reviewScriptFindings(tsx('text-ink font-semibold'), 'components/ui/card.tsx'), [
    'components/ui/card.tsx:1: Geist is never set above 500 (decision D6); use a role or font-medium',
  ]);
  assert.equal(reviewScriptFindings(tsx('hover:font-bold'), 'apps/docs/src/x.tsx').length, 1);
  assert.deepEqual(reviewScriptFindings(tsx('text-ink font-medium'), 'components/ui/card.tsx'), []);
  assert.deepEqual(reviewScriptFindings(tsx('font-semibold'), 'components/marketing/hero.tsx'), []);
  assert.deepEqual(
    reviewStylesheetFindings(
      '.a { font-weight: 600; }\n.b { font-weight: 500; }',
      'apps/docs/src/a.css',
    ),
    [
      'apps/docs/src/a.css:1: Geist is never set above 500 (decision D6); use a role or font-medium',
    ],
  );
  assert.equal(
    reviewStylesheetFindings(
      ':root { --text-heading--font-weight: 700; }',
      'apps/app/src/globals.css',
    ).length,
    1,
  );
  assert.deepEqual(
    reviewStylesheetFindings('.a { font-weight: 700; }', 'apps/marketing/src/site.css'),
    [],
  );
});

test('D5: line-control edges a field or card nowhere, and stays on small marks', () => {
  assert.deepEqual(
    reviewScriptFindings(tsx('bg-surface border-line-control border'), 'components/ui/input.tsx'),
    [
      'components/ui/input.tsx:1: line-control is for small marks only; a field, composer or card wears the soft xs ring (decision D5)',
    ],
  );
  assert.deepEqual(
    reviewScriptFindings(
      tsx('bg-surface border-line-control border'),
      'components/ui/checkbox.tsx',
    ),
    [],
  );
  assert.equal(
    reviewStylesheetFindings(
      '.card:hover { border-color: var(--color-line-control); }',
      'apps/docs/src/components/ArticlePager.astro',
    ).length,
    1,
  );
  // The token's own declaration is not a use of it.
  assert.deepEqual(
    reviewStylesheetFindings(':root { --color-line-control: gray; }', 'apps/app/src/globals.css'),
    [],
  );
});

test('D7: Cal Sans in the app is the page title alone; the docs keep their display face', () => {
  assert.deepEqual(
    reviewScriptFindings(tsx('font-display text-title text-ink'), 'components/ui/dialog.tsx'),
    [
      'components/ui/dialog.tsx:1: in the app Cal Sans is the page title alone (type-page-title, decision D7); use a Geist role',
    ],
  );
  assert.deepEqual(reviewScriptFindings(tsx('font-display text-title'), 'apps/docs/src/a.tsx'), []);
  // A font-face descriptor in a stylesheet string is not a class.
  assert.deepEqual(
    reviewScriptFindings(
      'export const css = "font-display: fallback;";\n',
      'lib/fonts/brand-fonts.ts',
    ),
    [],
  );
  const roles = [
    '.type-page-title { font-family: var(--font-display); }',
    '.type-figure { font-family: var(--font-display); }',
    '.prose-content h2 { font-family: var(--font-sans); }',
  ].join('\n');
  assert.deepEqual(reviewStylesheetFindings(roles, 'apps/app/src/globals.css'), [
    'apps/app/src/globals.css:2: in the app Cal Sans is the page title alone (type-page-title, decision D7); use a Geist role',
  ]);
});

test('D9: a grid that adds columns between desktop and shell is a wrapped metric row', () => {
  const grid = (layout) => `const LAYOUT = { quarters: '${layout}' };\n`;
  assert.deepEqual(
    reviewScriptFindings(
      grid('desktop:grid-cols-2 shell:grid-cols-4'),
      'components/ui/app-grid.tsx',
    ),
    [
      "components/ui/app-grid.tsx:1: a row of equal items holds its count from 981px (decision D9), never 2 × 2 or 2 + 1 at the owner's 982px",
    ],
  );
  assert.deepEqual(
    reviewScriptFindings(grid('desktop:grid-cols-4'), 'components/ui/app-grid.tsx'),
    [],
  );
});
