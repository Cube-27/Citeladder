import assert from 'node:assert/strict';
import test from 'node:test';

import {
  astroStyleFindings,
  cssValueFindings,
} from '../../frontend/scripts/design-system-css-values.mjs';

const lines = (findings) => findings.map((finding) => finding.split(': ')[0]);

test('raw colour, type, z, motion, shadow, spacing and border-width values fail', () => {
  const css = [
    '.a { color: #fff; }',
    '.b { background: oklch(50% 0.1 30); }',
    '.c { font-size: 13px; }',
    '.d { line-height: 1.25; }',
    '.e { z-index: 10; }',
    '.f { transition: opacity 150ms linear; }',
    '.g { box-shadow: 0 1px 2px var(--color-rule); }',
    '.h { padding: 8px 12px; }',
    '.i { border: 2px solid var(--color-rule); }',
    '.j { margin-top: -0.5rem; }',
  ].join('\n');
  assert.deepEqual(lines(cssValueFindings('x.css', css)), [
    'x.css:1',
    'x.css:2',
    'x.css:3',
    'x.css:4',
    'x.css:5',
    'x.css:6',
    'x.css:7',
    'x.css:8',
    'x.css:9',
    'x.css:10',
  ]);
});

test('tokens, keywords, zero, multipliers, percentages, gradient stops and exempt blocks pass', () => {
  const css = `
@theme { --spacing: 4px; --z-index-raised: 10; }
:root { --pad: 12px; }
.a { color: var(--text-color-ink); border: var(--rule-width) solid var(--color-rule); }
.b { padding: calc(var(--spacing) * 3) 0; margin: auto; z-index: var(--z-index-raised); }
.c { background: color-mix(in oklch, var(--color-accent) 50%, transparent); }
.d { background-image: repeating-linear-gradient(135deg, transparent 0 6px, var(--color-rule) 6px 7px); }
.e { width: 128px; clip-path: inset(-24px 0 0 0); line-height: var(--text-label--line-height); }
@media (forced-colors: active) { .f { border: 1px solid CanvasText; } }
@media (prefers-reduced-motion: reduce) { .g { transition-duration: 1ms; } }
@keyframes spin { to { transform: rotate(1turn); } }
@font-face { font-weight: 400; }
`;
  assert.deepEqual(cssValueFindings('ok.css', css), []);
});

test('an Astro style block is checked on its own lines', () => {
  const astro =
    '---\nconst a = 1;\n---\n<div class="x" />\n<style>\n  .x { z-index: -1; }\n</style>\n';
  assert.deepEqual(lines(astroStyleFindings('Box.astro', astro)), ['Box.astro:6']);
});
