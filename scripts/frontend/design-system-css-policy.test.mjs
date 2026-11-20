import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cssPolicyFindings } from '../../frontend/scripts/design-system-css-checks.mjs';

const label = 'apps/marketing/src/example.css';
const rules = (css, file = label) => cssPolicyFindings(css, file).map(({ rule }) => rule);

test('a custom property that reads itself is a cycle, except in the token owner', () => {
  const cycle = '.a { --text-sm--line-height: var(--text-sm--line-height); }';
  assert.deepEqual(rules(cycle), ['css-cycle']);
  assert.deepEqual(rules(cycle, 'apps/app/src/globals.css'), []);
  assert.deepEqual(rules('.a { --gap: var(--card-padding); }'), []);
});

test('an unparseable stylesheet is a finding', () => {
  assert.deepEqual(rules('.a { color: red;'), ['css-parse']);
});
