import assert from 'node:assert/strict';
import test from 'node:test';

import {
  astroStyleFindings,
  cssValueFindings,
} from '../../frontend/scripts/design-system-css-values.mjs';

const lines = (findings) => findings.map((finding) => finding.split(': ')[0]);

test('raw colour, type, z, motion, shadow, spacing, size, border, radius, opacity and font values fail', () => {
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
    '.k { color: rebeccapurple; }',
    '.l { --tint: #123456; }',
    '.m { padding: var(--pad, 13px); }',
    '.n { color: var(--tint, red); }',
    '.o { background: var(--ramp-red-52_4); }',
    '@media (prefers-reduced-motion: no-preference) { .p { padding: 13px; } }',
    '.q { border-radius: 7px; border-top-left-radius: 3px; }',
    '.r { opacity: .55; }',
    ".s { font-family: Arial, 'Geist'; }",
    '.t { width: 313px; max-width: 37rem; }',
    '.u { --pad: 13px; }',
    '.v { mask-image: linear-gradient(#000, transparent); }',
  ].join('\n');
  const twice = new Set([17, 20]);
  assert.deepEqual(
    lines(cssValueFindings('x.css', css)),
    Array.from({ length: 22 }, (_, index) => index + 1).flatMap((line) =>
      Array(twice.has(line) ? 2 : 1).fill(`x.css:${line}`),
    ),
  );
});

test('tokens, keywords, zero, multipliers, percentages, gradient stops and exempt blocks pass', () => {
  const css = `
@theme { --spacing: 4px; --z-index-raised: 10; }
:root { --pad: 12px; }
.a { color: var(--text-color-ink); border: var(--rule-width) solid var(--color-rule); }
.b { padding: calc(var(--spacing) * 3) 0; margin: auto; z-index: var(--z-index-raised); }
.c { background: color-mix(in oklch, var(--color-accent) 50%, transparent); }
.d { background-image: repeating-linear-gradient(135deg, transparent 0 6px, var(--color-rule) 6px 7px); }
.e { clip-path: inset(-24px 0 0 0); line-height: var(--text-label--line-height); }
.h { opacity: 1; mask-image: linear-gradient(black, transparent); font-family: var(--font-mono); width: var(--w); }
.i { color: var(--tint, var(--text-color-ink)); border-radius: var(--radius-card); }
@media (forced-colors: active) { .f { border: 1px solid CanvasText; } }
@media (prefers-reduced-motion: reduce) { .g { transition-duration: 1ms; } }
@keyframes spin { to { transform: rotate(1turn); } }
@font-face { font-weight: 400; }
`;
  assert.deepEqual(cssValueFindings('ok.css', css), []);
});

test('a token file may declare ramp colours and read them in rules', () => {
  const css = ':root { --ramp-ink: #111; }\n.a { color: var(--ramp-ink, #111); }';
  assert.deepEqual(cssValueFindings('apps/app/src/globals.css', css), []);
  assert.deepEqual(lines(cssValueFindings('apps/app/src/screen.css', css)), [
    'apps/app/src/screen.css:1',
    'apps/app/src/screen.css:2',
  ]);
});

test('an Astro style block is checked on its own lines', () => {
  const astro =
    '---\nconst a = 1;\n---\n<div class="x" />\n<style>\n  .x { z-index: -1; }\n</style>\n';
  assert.deepEqual(lines(astroStyleFindings('Box.astro', astro)), ['Box.astro:6']);
});
