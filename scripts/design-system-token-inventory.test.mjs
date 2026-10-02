import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tokenInventory } from '../frontend/scripts/audit-design-tokens.mjs';
import { tokenContractViolations } from '../frontend/scripts/design-system-source-checks.mjs';

test('token inventory resolves scoped aliases and neutral state derivation in both themes', () => {
  const rows = tokenInventory(`
    @theme {
      --color-panel: #ffffff;
      --color-foreground: #000000;
      --color-active: color-mix(in srgb, var(--color-panel), var(--color-foreground) 10%);
      --color-secondary: var(--color-foreground);
    }
    :root[data-theme='dark'] { --color-panel: #000000; --color-foreground: #ffffff; }
  `);
  const active = rows.find(({ token }) => token === '--color-active');
  assert.equal(active.light, '#e6e6e6');
  assert.equal(active.dark, '#1a1a1a');
  const secondary = rows.find(({ token }) => token === '--color-secondary');
  assert.equal(secondary.light, '#000000');
  assert.equal(secondary.dark, '#ffffff');
});

test('token contract rejects missing or ambiguous roles and retirement residue', () => {
  const source = '@theme { --color-panel: #ffffff; }';
  const row = '| `--color-panel` | surface | Resting panel | On ground | white | white |';
  assert.deepEqual(tokenContractViolations(source, row), []);
  assert.equal(tokenContractViolations(source, '').length, 1);
  assert.equal(tokenContractViolations(source, row + '\n' + row).length, 1);
  assert.equal(tokenContractViolations(source, row.replace('surface', 'ambiguous')).length, 1);
  assert.equal(tokenContractViolations(source, '| `--color-panel` | surface |').length, 1);
  assert.equal(tokenContractViolations(source, row.replace('Resting panel', '')).length, 1);
  assert.equal(
    tokenContractViolations(source, row + '\n' + row.replace('--color-panel', '--color-retired'))
      .length,
    1,
  );
});
