import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { tokenContractFindings } from '../../frontend/scripts/design-system-contract.mjs';

test('globals.css must carry the system tokens exactly, and nothing else', () => {
  const contract = JSON.parse(
    readFileSync(
      new URL('../../frontend/scripts/design-system-tokens.json', import.meta.url),
      'utf8',
    ),
  );
  const css = readFileSync(
    new URL('../../frontend/apps/app/src/globals.css', import.meta.url),
    'utf8',
  );
  assert.deepEqual(tokenContractFindings(css, contract), []);
  const drifted = css
    .replace('--color-accent: #e8501a;', '--color-accent: #00a650;')
    .replace('@theme {', '@theme {\n  --color-mint: #e6f6ec;')
    .replace('--text-body: 1rem;', '--text-body: 16px;')
    .replace('--text-data: 0.8125rem;', '--text-data: 0.875rem;');
  assert.deepEqual(tokenContractFindings(drifted, contract), [
    '--color-accent is #00a650 in light; the system says #e8501a',
    '--color-mint is not a system colour; the system has no such token',
    '--text-body is 16px; the system says 1rem',
    '--text-data is 0.875rem; the system says 0.8125rem',
  ]);
});
