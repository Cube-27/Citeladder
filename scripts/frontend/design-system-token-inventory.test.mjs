import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  generatedBlocks,
  refreshGeneratedBlocks,
  tokenInventory,
} from '../../frontend/scripts/audit-design-tokens.mjs';

test('token inventory resolves scoped aliases in both themes', () => {
  const rows = tokenInventory(`
    @theme {
      --color-surface: #ffffff;
      --color-ink: #111111;
      --color-focus: var(--color-ink);
      --color-scrim: rgb(17 17 17 / 40%);
    }
    :root[data-theme='dark'] { --color-surface: #151515; --color-ink: #f4f4f4; }
  `);
  assert.deepEqual(rows, [
    { token: '--color-focus', light: '#111111', dark: '#f4f4f4' },
    { token: '--color-ink', light: '#111111', dark: '#f4f4f4' },
    { token: '--color-scrim', light: 'rgb(17 17 17 / 40%)', dark: 'rgb(17 17 17 / 40%)' },
    { token: '--color-surface', light: '#ffffff', dark: '#151515' },
  ]);
});

test('generated regions are refreshed, and stale or missing ones reported', () => {
  const blocks = new Map([
    ['radii', '| Token | Value |'],
    ['type', '| Role |'],
  ]);
  const document =
    'intro\n<!-- generated:radii:start -->\nold\n<!-- generated:radii:end -->\noutro\n';
  const { text, stale, missing } = refreshGeneratedBlocks(document, blocks);
  assert.deepEqual(stale, ['radii']);
  assert.deepEqual(missing, ['type']);
  assert.equal(refreshGeneratedBlocks(text, blocks).stale.length, 0);
});

test('the rounded block lists the radius ladder from CSS in size order', () => {
  const radii = generatedBlocks(
    '@theme { --radius-*: initial; --radius-full: 9999px; --radius-xs: 4px; } :root { --radius-card: 0.75rem; }',
    '',
  ).get('radii');
  assert.equal(
    radii,
    ['```yaml', 'rounded:', '  xs: 4px', '  card: 12px', '  full: 9999px', '```'].join('\n'),
  );
});

test('the colors block names each token with its light value and its dark one', () => {
  const colors = generatedBlocks(
    `@theme { --color-ink: #111111; --color-scrim: rgb(17 17 17 / 40%); }
    :root[data-theme='dark'] { --color-ink: #f4f4f4; }`,
    '',
  ).get('tokens');
  assert.equal(
    colors,
    [
      '```yaml',
      'colors:',
      "  ink: '#111111' # dark '#f4f4f4'",
      "  scrim: 'rgb(17 17 17 / 40%)' # dark 'rgb(17 17 17 / 40%)'",
      '```',
    ].join('\n'),
  );
});

test('a website role reading the marketing sizes is documented at desktop and tablet', () => {
  const type = generatedBlocks(
    `@theme { --text-display-2xl: 44px; --text-display-xl: 36px; --text-body: 1rem; }
    [data-marketing-surface] { --text-site-title: var(--text-display-2xl); }
    @media (min-width: 768px) and (max-width: 1023px) {
      [data-marketing-surface] { --text-site-title: var(--text-display-xl); }
    }
    @media (max-width: 767px) { [data-marketing-surface] { --text-site-title: 30px; } }`,
    `.cl-phero-title { font-size: var(--text-site-title); line-height: 1.1; }
    .cl-body { font-size: var(--text-body); line-height: 1.6; }
    .cl-phero--lg .cl-phero-title { font-size: 2rem; }
    .cl-frame { font-size: var(--text-body); }`,
  ).get('type');
  assert.match(
    type,
    /^ {2}cl-phero-title: \{ fontSize: 44px, lineHeight: 1\.1 \} # 768–1023px: 36px \/ 1\.1$/m,
  );
  assert.match(type, /^ {2}cl-body: \{ fontSize: 16px, lineHeight: 1\.6 \}$/m);
  // Only the roles themselves: a modifier rule or another component is not a role.
  assert.doesNotMatch(type, /cl-frame|32px/);
});
