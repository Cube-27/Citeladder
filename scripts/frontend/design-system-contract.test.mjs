import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  colourNotationFindings,
  tokenContractFindings,
} from '../../frontend/scripts/design-system-contract.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('globals.css must carry the system tokens exactly, and nothing else', () => {
  const contract = JSON.parse(read('../../frontend/scripts/design-system-tokens.json'));
  const css = read('../../frontend/apps/app/src/globals.css');
  assert.deepEqual(tokenContractFindings(css, contract), []);
  const drifted = css
    .replace('--color-accent: oklch(63.4% 0.1973 37.5);', '--color-accent: oklch(60% 0.2 140);')
    .replace(
      '--color-state-hover: oklch(from var(--color-ink) l c h / 6%);',
      '--color-state-hover: oklch(from var(--color-ink) l c h / 7%);',
    )
    .replace('@theme {', '@theme {\n  --color-mint: oklch(95% 0.03 155);')
    .replace('--text-body: 1rem;', '--text-body: 16px;')
    .replace('--text-data: 0.8125rem;', '--text-data: 0.875rem;');
  assert.deepEqual(tokenContractFindings(drifted, contract), [
    '--color-state-hover is oklch(from var(--color-ink) l c h / 7%) in light; the system says oklch(from {ink} l c h / 6%)',
    '--color-state-hover is oklch(from var(--color-ink) l c h / 7%) in dark; the system says oklch(from {ink} l c h / 6%)',
    '--color-accent is oklch(60% 0.2 140) in light; the system says oklch(63.4% 0.1973 37.5)',
    '--color-mint is not a system colour; the system has no such token',
    '--text-body is 16px; the system says 1rem',
    '--text-data is 0.875rem; the system says 0.8125rem',
  ]);
});

test('the token stylesheets write every colour in oklch', () => {
  assert.deepEqual(colourNotationFindings(read('../../frontend/apps/app/src/globals.css')), []);
  assert.deepEqual(colourNotationFindings(read('../../frontend/apps/app/src/ui-motion.css')), []);
  const css = [
    ':root {',
    '  --color-a: oklch(96.7% 0 0);',
    '  --color-b: oklch(from var(--color-ink) l c h / 6%);',
    '  --c: color-mix(in oklch, var(--color-ink) 7%, transparent);',
    '  --color-d: #F4F4F4;',
    '  --shadow-e: 0 1px 2px rgba(17, 17, 17, 0.05);',
    '  --color-f: hsl(0 0% 96%);',
    '}',
    '.g { background: color-mix(in srgb, var(--color-ink) 4%, white); }',
  ].join('\n');
  assert.deepEqual(colourNotationFindings(css), [
    'line 5: --color-d: #F4F4F4 must be oklch',
    'line 6: --shadow-e: 0 1px 2px rgba(17, 17, 17, 0.05) must be oklch',
    'line 7: --color-f: hsl(0 0% 96%) must be oklch',
    'line 9: background: color-mix(in srgb, var(--color-ink) 4%, white) must be oklch',
  ]);
});
