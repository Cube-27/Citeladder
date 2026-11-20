import assert from 'node:assert/strict';
import { test } from 'node:test';

import { websiteStyleViolations } from '../../frontend/scripts/design-system-stylesheet-checks.mjs';

test('website styles take colours from the token file; radii are free', () => {
  const tokened = [
    '.a { color: var(--color-ink); border-radius: 12px; }',
    '.b { background: color-mix(in oklch, var(--color-ink) 5%, transparent); border-radius: 0; }',
    '/* rgb(0 0 0) in a comment is not a colour */',
  ].join('\n');
  assert.deepEqual(websiteStyleViolations(tokened, 'ok.css'), []);

  assert.deepEqual(websiteStyleViolations('.a { color: oklch(50% 0 0); }', 'a.css'), [
    'a.css: component colours must use semantic tokens',
  ]);
  assert.deepEqual(websiteStyleViolations('.a { background: rgb(0 0 0 / 5%); }', 'b.css'), [
    'b.css: component colours must use semantic tokens',
  ]);
});
