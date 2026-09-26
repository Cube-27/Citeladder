import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { textContrastViolations } from '../frontend/scripts/design-system-contrast.mjs';

test('contrast fails when the rendered scope is unreadable although the fallback passes', () => {
  const root = mkdtempSync(join(tmpdir(), 'citeladder-contrast-'));
  try {
    const surfaces = [
      'background',
      'background-alt',
      'panel',
      'panel-tonal',
      'well',
      'active',
      'sidebar',
    ];
    const inks = ['foreground', 'secondary', 'muted', 'subtle'];
    const base = [
      ...surfaces.map((role) => `--color-${role}: #ffffff;`),
      ...inks.map((role) => `--color-${role}: #000000;`),
      ...Array.from({ length: 8 }, (_, i) => `--color-chart-${i + 1}: #000000;`),
    ].join('\n');
    const dir = join(root, 'apps', 'app', 'src');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'globals.css');
    const theme = `@theme { ${base} --ink: #000000; --color-secondary: var(--ink); } :root[data-theme='dark'] { --color-background: #ffffff; } [data-public-surface] { --ink: #000000; }`;
    writeFileSync(path, theme);
    assert.deepEqual(textContrastViolations(root), []);
    writeFileSync(path, `${theme} [data-public-surface] { --ink: #ffffff; }`);
    assert.ok(
      textContrastViolations(root).some((error) =>
        error.includes('[data-public-surface] --color-secondary'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
