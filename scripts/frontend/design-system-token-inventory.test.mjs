import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  duplicateTokenFindings,
  generatedBlocks,
  refreshGeneratedBlocks,
  tokenInventory,
  zeroConsumerTokens,
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

test('two tokens with one value fail unless aliased or declared the same', () => {
  const source = (extra) => `@theme { --color-panel: #ffffff; --color-input: #ffffff; ${extra} }`;
  // Dark inherits the light values, so the pair collides in both themes.
  const duplicate = duplicateTokenFindings(source(''), []);
  assert.equal(duplicate.length, 2);
  assert.match(duplicate[0], /light --color-input and --color-panel/);
  assert.match(duplicate[1], /dark --color-input and --color-panel/);
  assert.deepEqual(
    duplicateTokenFindings(
      '@theme { --color-panel: #ffffff; --color-input: var(--color-panel); }',
      [],
    ),
    [],
  );
  const pair = { tokens: ['--color-panel', '--color-input'], reason: 'x' };
  const both = [
    { ...pair, theme: 'light' },
    { ...pair, theme: 'dark' },
  ];
  assert.deepEqual(duplicateTokenFindings(source(''), both), []);
  // A light allowance does not excuse the dark theme.
  const light = [{ ...pair, theme: 'light' }];
  assert.deepEqual(
    duplicateTokenFindings(source(''), light).map((finding) => finding.split(' ')[1]),
    ['dark'],
  );
});

test('a chart series may never wear a status value, allowlisted or not', () => {
  const source = '@theme { --color-data-3: #0d9488; --color-positive: #0d9488; }';
  const sameAs = ['light', 'dark'].map((theme) => ({
    theme,
    tokens: ['--color-data-3', '--color-positive'],
    reason: 'x',
  }));
  const findings = duplicateTokenFindings(source, sameAs);
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.includes('chart series never wear')));
});

test('a token is consumed by var(), by a utility class or by its size companion', () => {
  const source = `@theme {
    --color-accent: #000000; --color-caret: #000000; --color-unused: #000000;
    --text-label: 0.8125rem; --text-label--line-height: 1.125rem;
    --radius-card: 12px; --ease-standard: linear; --font-sans: x;
  }`;
  const files = [
    { path: 'a.css', text: '.a { color: var(--color-accent); }' },
    {
      path: 'components/b.tsx',
      text: 'const b = cva("caret-caret/50 hover:text-label", {}); const c = <i className="rounded-card" />;',
    },
    { path: 'c.css', text: '.c { transition-timing-function: var(--ease-standard); }' },
    // A declaration is not a consumer.
    { path: 'd.css', text: ':root { --color-unused: #ffffff; }' },
  ];
  assert.deepEqual(zeroConsumerTokens(source, files), ['--color-unused']);
  // A token the system's contract requires is not dead before a page uses it.
  assert.deepEqual(zeroConsumerTokens(source, files, new Set(['--color-unused'])), []);
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

test('a refreshed region keeps a CRLF document in CRLF', () => {
  const blocks = new Map([['radii', '| Token |\n| --- |']]);
  const document =
    'intro\r\n<!-- generated:radii:start -->\r\nold\r\n<!-- generated:radii:end -->\r\n';
  const { text } = refreshGeneratedBlocks(document, blocks);
  assert.equal(text.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(refreshGeneratedBlocks(text, blocks).stale.length, 0);
});

test('the radius table lists the ladder from CSS in size order', () => {
  const radii = generatedBlocks(
    '@theme { --radius-*: initial; --radius-full: 9999px; --radius-xs: 4px; } :root { --radius-card: 0.75rem; }',
    '',
  ).get('radii');
  const rows = radii
    .split('\n')
    .slice(2)
    .map((row) => row.split('|')[1].trim());
  assert.deepEqual(rows, ['`--radius-xs`', '`--radius-card`', '`--radius-full`']);
  assert.match(radii, /`--radius-card` \| `12px`/);
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
  assert.match(type, /\| `\.cl-phero-title` \| public \| `44px \/ 1\.1` \| `36px \/ 1\.1` \|/);
  assert.match(type, /\| `\.cl-body` \| public \| `16px \/ 1\.6` \| — \|/);
  // Only the roles themselves: a modifier rule or another component is not a role.
  assert.doesNotMatch(type, /cl-frame|32px/);
});
