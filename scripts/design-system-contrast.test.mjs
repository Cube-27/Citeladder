import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  contrastRoles,
  paletteAccepted,
  paletteDeclarations,
  paletteViolations,
  resolvePalette,
  tokenSource,
} from '../frontend/scripts/design-system-contrast.mjs';

function palette({ ink, paper }) {
  const { inks, surfaces } = contrastRoles();
  return {
    ...Object.fromEntries(surfaces.map((token) => [token, paper])),
    ...Object.fromEntries(inks.map((token) => [token, ink])),
  };
}

const LIGHT = palette({ ink: '#000000', paper: '#ffffff' });
const DARK = palette({ ink: '#ffffff', paper: '#000000' });

const block = (selector, values) =>
  `${selector} { ${Object.entries(values)
    .map(([token, value]) => `${token}: ${value};`)
    .join(' ')} }`;

function css({ light = {}, dark = {}, extra = '' } = {}) {
  return [
    block('@theme', { ...LIGHT, ...light }),
    block(":root[data-theme='dark']", { ...DARK, ...dark }),
    extra,
  ].join('\n');
}

test('a scope keeps an unterminated last declaration and skips nested blocks', () => {
  const declarations = paletteDeclarations(
    ':root { --color-ground: #ffffff; @media (min-width: 1px) { --color-nested: #000000; } --color-ink-2: #555555 }',
    ':root',
  );
  assert.equal(declarations.get('--color-ground'), '#ffffff');
  assert.equal(declarations.get('--color-ink-2'), '#555555');
  assert.equal(declarations.has('--color-nested'), false);
});

test('a palette that meets every pair in every scope passes', () => {
  assert.deepEqual(paletteViolations(css()), []);
});

test('a dark rebinding fails the dark scope only', () => {
  const violations = paletteViolations(css({ dark: { '--text-color-ink-2': '#111111' } }));
  assert.ok(violations.length > 0);
  assert.ok(violations.every((violation) => violation.includes("data-theme='dark'")));
  assert.ok(
    violations.some((violation) => violation.includes('--text-color-ink-2 on --color-ground')),
  );
});

test('an app rebinding fails the app scope it reaches and spares the website', () => {
  const appLight = ':root:not([data-public-surface]) { --text-color-ink-2: #eeeeee; }';
  const violations = paletteViolations(css({ extra: appLight }));
  assert.ok(violations.length > 0);
  assert.ok(violations.every((violation) => violation.includes(':not([data-public-surface])')));
  assert.ok(
    violations.some((violation) =>
      violation.includes(
        ':root:not([data-public-surface]) --text-color-ink-2 on --color-ground is 1.',
      ),
    ),
  );
});

test("the app's light rebinding reaches the app's dark unless the app's dark rebinds it", () => {
  const appLight = ':root:not([data-public-surface]) { --text-color-ink-2: #555555; }';
  const appDark =
    ":root[data-theme='dark']:not([data-public-surface]) { --text-color-ink-2: #ffffff; }";
  const unbound = paletteViolations(css({ extra: appLight }));
  assert.ok(
    unbound.some((violation) =>
      violation.includes(
        ":root[data-theme='dark']:not([data-public-surface]) --text-color-ink-2 on --color-ground is 2.",
      ),
    ),
  );
  assert.deepEqual(paletteViolations(css({ extra: `${appLight}\n${appDark}` })), []);
});

test('a website-only pair holds the website palettes only, since the app has none', () => {
  const violations = paletteViolations(css({ light: { '--color-control-line': '#ffffff' } }));
  assert.ok(
    violations.includes(
      'apps/app/src/globals.css: :root --color-control-line on --color-ground is 1.00:1; needs 3:1',
    ),
  );
  assert.ok(!violations.some((violation) => violation.includes('data-public-surface')));
});

test("the app's series holds 3:1 in the app's palettes and is not measured on the website", () => {
  const violations = paletteViolations(css({ light: { '--color-data-you': '#eeeeee' } }));
  assert.deepEqual(
    violations,
    ['ground', 'panel', 'raised', 'raised-2'].map(
      (fill) =>
        `apps/app/src/globals.css: :root:not([data-public-surface]) --color-data-you on --color-${fill} is 1.16:1; needs 3:1`,
    ),
  );
});

test('a text role nobody listed is measured on every ground of its palette', () => {
  const violations = paletteViolations(css({ light: { '--text-color-quiet': '#eeeeee' } }));
  assert.ok(
    violations.includes(
      'apps/app/src/globals.css: :root --text-color-quiet on --color-well is 1.16:1; needs 4.5:1',
    ),
  );
  assert.ok(
    violations.includes(
      'apps/app/src/globals.css: :root:not([data-public-surface]) --text-color-quiet on --color-raised-2 is 1.16:1; needs 4.5:1',
    ),
  );
});

test('only the owner-accepted Search Console tiles are exempt, and the same ink elsewhere fails', () => {
  const source = css({
    light: {
      '--text-color-metric-ink': '#ffffff',
      '--color-metric-clicks': '#ffffff',
      '--color-metric-ctr': '#000000',
      '--color-metric-impressions': '#ffffff',
    },
  });
  const violations = paletteViolations(source);
  assert.ok(!violations.some((violation) => violation.includes('metric-clicks')));
  assert.ok(
    violations.includes(
      'apps/app/src/globals.css: :root:not([data-public-surface]) --text-color-metric-ink on --color-metric-impressions is 1.00:1; needs 4.5:1',
    ),
  );
  assert.deepEqual(
    paletteAccepted(source),
    [':root:not([data-public-surface])', ":root[data-theme='dark']:not([data-public-surface])"].map(
      (scope) =>
        `apps/app/src/globals.css: ${scope} --text-color-metric-ink on --color-metric-clicks is 1.00:1; needs 4.5:1; accepted: white figures on the Search Console metric tiles are the owner-chosen look (owner, 2026-11-25)`,
    ),
  );
});

test('a translucent soft is composited onto the surface before measuring', () => {
  const violations = paletteViolations(
    css({ light: { '--color-positive-wash': 'rgb(0 0 0 / 90%)' } }),
  );
  assert.ok(
    violations.some((violation) =>
      violation.includes('--color-positive on --color-positive-wash is 1.'),
    ),
  );
});

test('oklch literals and relative colours resolve to the sRGB they render', () => {
  const source = [
    '@theme { --color-ink: oklch(17.8% 0 0); --color-hover: oklch(from var(--color-ink) l c h / 6%); }',
    '@theme { --color-mix: color-mix(in oklch, var(--color-ink) 80%, var(--color-paper)); }',
    '@theme inline { --color-mark: var(--color-accent); }',
    ':root { --color-accent: oklch(63.4% 0.1973 37.5); --color-rule: oklch(21% 0.01 268 / 11%); --color-paper: oklch(96.7% 0 0); }',
    ":root[data-theme='dark'] { --color-ink: oklch(96.7% 0 0); }",
  ].join('\n');
  const light = resolvePalette(source, ':root');
  assert.deepEqual(
    ['--color-ink', '--color-hover', '--color-mark', '--color-rule', '--color-mix'].map((token) =>
      light.get(token),
    ),
    ['#111111', 'rgb(17 17 17 / 6%)', '#e8501a', 'rgb(22 24 29 / 11%)', '#373737'],
  );
  assert.equal(
    resolvePalette(source, ":root[data-theme='dark']").get('--color-hover'),
    'rgb(244 244 244 / 6%)',
  );
});

test('the shipped palette meets every pair in the website and app palettes, both themes', () => {
  const source = tokenSource(fileURLToPath(new URL('../frontend', import.meta.url)));
  assert.deepEqual(paletteViolations(source), []);
});

test('a stylesheet without a dark mapping fails', () => {
  const violations = paletteViolations(block('@theme', LIGHT));
  assert.ok(violations.includes('apps/app/src/globals.css: dark theme token mapping is missing'));
});
