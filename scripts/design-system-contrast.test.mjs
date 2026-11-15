import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  contrastRoles,
  paletteDeclarations,
  paletteViolations,
} from '../frontend/scripts/design-system-contrast.mjs';

/**
 * A complete palette that passes every pair. Every ink the matrix reads is
 * `ink` and every surface `paper`, so a new matrix row needs no fixture edit;
 * the labels on fills and the marks the separation check measures are set
 * explicitly.
 */
function palette({ ink, paper, positive, negative, series, appSeries }) {
  const { inks, surfaces } = contrastRoles();
  return {
    ...Object.fromEntries(surfaces.map((token) => [token, paper])),
    ...Object.fromEntries(inks.map((token) => [token, ink])),
    // Fills carry the other end of the scale.
    '--color-ink-hover': ink,
    '--color-on-ink': paper,
    '--color-on-accent': paper,
    '--color-positive': positive,
    '--color-negative': negative,
    ...Object.fromEntries(series.map((value, index) => [`--color-data-${index + 1}`, value])),
    ...Object.fromEntries(
      ['you', 'rival-1', 'rival-2', 'rival-3', 'rival-4'].map((name, index) => [
        `--color-data-${name}`,
        appSeries[index],
      ]),
    ),
  };
}

const LIGHT = palette({
  ink: '#000000',
  paper: '#ffffff',
  positive: '#000000',
  negative: '#5e5e5e',
  series: ['#000000', '#595959', '#949494'],
  appSeries: ['#e8501a', '#000000', '#2f6f9f', '#4b3a8a', '#1f7d73'],
});
const DARK = palette({
  ink: '#ffffff',
  paper: '#000000',
  positive: '#ffffff',
  negative: '#949494',
  series: ['#ffffff', '#a0a0a0', '#5f5f5f'],
  appSeries: ['#ff6a33', '#ffffff', '#6fb3e0', '#8a73d9', '#4fc4b5'],
});

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
    ':root { --color-paper: #ffffff; @media (min-width: 1px) { --color-nested: #000000; } --color-ink-muted: #555555 }',
    ':root',
  );
  assert.equal(declarations.get('--color-paper'), '#ffffff');
  assert.equal(declarations.get('--color-ink-muted'), '#555555');
  assert.equal(declarations.has('--color-nested'), false);
});

test('a palette that meets every pair in every scope passes', () => {
  assert.deepEqual(paletteViolations(css()), []);
});

test('a dark rebinding fails the dark scope only', () => {
  const violations = paletteViolations(css({ dark: { '--color-ink-muted': '#111111' } }));
  assert.ok(violations.length > 0);
  assert.ok(violations.every((violation) => violation.includes("data-theme='dark'")));
  assert.ok(
    violations.some((violation) => violation.includes('--color-ink-muted on --color-paper')),
  );
});

test('an app rebinding fails the app scope it reaches and spares the website', () => {
  const appLight = ':root:not([data-public-surface]) { --color-ink-secondary: #eeeeee; }';
  const violations = paletteViolations(css({ extra: appLight }));
  assert.ok(violations.length > 0);
  assert.ok(violations.every((violation) => violation.includes(':not([data-public-surface])')));
  assert.ok(
    violations.some((violation) =>
      violation.includes(
        ':root:not([data-public-surface]) --color-ink-secondary on --color-sidebar is 1.',
      ),
    ),
  );
});

test("the app's light rebinding reaches the app's dark unless the app's dark rebinds it", () => {
  const appLight = ':root:not([data-public-surface]) { --color-ink-secondary: #555555; }';
  const appDark =
    ":root[data-theme='dark']:not([data-public-surface]) { --color-ink-secondary: #ffffff; }";
  const unbound = paletteViolations(css({ extra: appLight }));
  assert.ok(
    unbound.some((violation) =>
      violation.includes(
        ":root[data-theme='dark']:not([data-public-surface]) --color-ink-secondary on --color-paper is 2.",
      ),
    ),
  );
  assert.deepEqual(paletteViolations(css({ extra: `${appLight}\n${appDark}` })), []);
});

test('a website stage holds the website palettes only, since the app has none', () => {
  const violations = paletteViolations(css({ light: { '--color-stage-lilac': '#000000' } }));
  assert.ok(
    violations.includes(
      'apps/app/src/globals.css: :root --color-ink on --color-stage-lilac is 1.00:1; needs 4.5:1',
    ),
  );
  assert.ok(!violations.some((violation) => violation.includes('data-public-surface')));
});

test("the app's series holds 3:1 in the app's palettes and is not measured on the website", () => {
  const violations = paletteViolations(css({ light: { '--color-data-you': '#eeeeee' } }));
  assert.deepEqual(
    violations,
    ['ground', 'surface', 'well', 'raised'].map(
      (fill) =>
        `apps/app/src/globals.css: :root:not([data-public-surface]) --color-data-you on --color-${fill} is 1.16:1; needs 3:1`,
    ),
  );
});

test("you and the rivals must part in the app's palettes only", () => {
  const violations = paletteViolations(css({ light: { '--color-data-rival-3': '#2f6f9f' } }));
  assert.deepEqual(violations, [
    'apps/app/src/globals.css: :root:not([data-public-surface]) you and the rivals ' +
      '--color-data-rival-2 / --color-data-rival-3 are too close ' +
      '(ΔL* 0.0, deuteranopia ΔE 0.0, protanopia ΔE 0.0)',
  ]);
});

test('a translucent soft is composited onto the surface before measuring', () => {
  const violations = paletteViolations(
    css({ light: { '--color-positive-soft': 'rgb(0 0 0 / 90%)' } }),
  );
  assert.ok(
    violations.some((violation) =>
      violation.includes('--color-positive on --color-positive-soft is 1.'),
    ),
  );
});

test('a light chart series must hold 3:1 on every ground', () => {
  const violations = paletteViolations(css({ light: { '--color-data-3': '#eeeeee' } }));
  assert.ok(violations.some((violation) => violation.includes('--color-data-3 on --color-paper')));
  assert.ok(
    violations.some((violation) => violation.includes('--color-data-3 on --color-surface-sunken')),
  );
});

test('the shipped palette meets every pair in the website and app palettes, both themes', () => {
  const source = readFileSync(
    new URL('../frontend/apps/app/src/globals.css', import.meta.url),
    'utf8',
  );
  assert.deepEqual(paletteViolations(source), []);
});

test('positive and negative too close in lightness and under red-green loss fail', () => {
  const violations = paletteViolations(css({ dark: { '--color-negative': '#f4f4f4' } }));
  assert.ok(
    violations.some(
      (violation) =>
        violation.includes("data-theme='dark'") &&
        violation.includes('positive and negative --color-positive / --color-negative'),
    ),
  );
  // A hue difference that survives both deficiencies separates marks of
  // equal lightness: blue against amber.
  const hued = paletteViolations(
    css({ light: { '--color-positive': '#3b82f6', '--color-negative': '#b98a00' } }),
  );
  assert.ok(!hued.some((violation) => violation.includes('--color-positive / --color-negative')));
});

test('a stylesheet without a dark mapping fails', () => {
  const violations = paletteViolations(block('@theme', LIGHT));
  assert.ok(violations.includes('apps/app/src/globals.css: dark theme token mapping is missing'));
});
