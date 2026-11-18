import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  composite,
  contrastRatio,
  formatColour,
  isHex,
  parseColour,
  separation,
} from './design-system-color.mjs';

const TOKEN_CSS = 'apps/app/src/globals.css';
const LIGHT = ':root';
const DARK = ":root[data-theme='dark']";
const APP_LIGHT = ':root:not([data-public-surface])';
const APP_DARK = ":root[data-theme='dark']:not([data-public-surface])";
/**
 * Each palette the product renders, as the rule blocks that build it in
 * cascade order: the website's two themes, then the app's two, which rebind
 * on top. The app's light block follows the system dark at the
 * same specificity, so it sits under the app's dark block in the app's dark.
 */
const SCOPES = [
  { name: LIGHT, layers: [LIGHT], website: true },
  { name: DARK, layers: [DARK], website: true },
  { name: APP_LIGHT, layers: [APP_LIGHT], website: false },
  { name: APP_DARK, layers: [DARK, APP_LIGHT, APP_DARK], website: false },
];

const color = (role) => `--color-${role}`;
const STATUSES = ['positive', 'negative', 'warning', 'info'];
const SOFTS = ['accent', ...STATUSES].map((role) => color(`${role}-soft`));
const GROUNDS = ['paper', 'sidebar', 'surface', 'surface-sunken'].map(color);
const STAGES = ['stage-sky', 'stage-mint', 'stage-lilac', 'stage-peach'].map(color);

/**
 * The contrast matrix, the design system's own (docs/design.md, Colors): every
 * text pair a token's usage names holds 4.5:1 in both themes; marks, control
 * borders and the focus ring hold 3:1. Each row pairs every ink with every
 * surface. A translucent surface is composited on each ground a row names in
 * `over` (`surface` when it names none), and a translucent ink on the surface
 * beneath it.
 */
const CONTRAST_PAIRS = [
  // The three inks on the page, the sidebar, the card and the inset.
  { inks: ['ink', 'ink-secondary', 'ink-muted'].map(color), surfaces: GROUNDS, minimum: 4.5 },
  // A hovered, pressed or selected row keeps its text readable. The
  // states are overlays, so each is checked over every ground it can tint.
  {
    inks: ['ink', 'ink-secondary'].map(color),
    surfaces: ['state-hover', 'state-pressed', 'state-selected'].map(color),
    over: GROUNDS,
    minimum: 4.5,
  },
  // Callout and badge bodies are ink on every tint.
  { inks: [color('ink')], surfaces: SOFTS, minimum: 4.5 },
  // The website's stages: copy on a tinted stage or hero wash, the
  // CtaBand's note and the hero's trial line included, is ink or
  // ink-secondary, never muted. The app has no stages, so only the
  // website's palettes are held to this row.
  {
    inks: [color('ink'), color('ink-secondary')],
    surfaces: STAGES,
    minimum: 4.5,
    websiteOnly: true,
  },
  // A status ink on paper, surface and its own tint.
  ...STATUSES.map((status) => ({
    inks: [color(status)],
    surfaces: [color('paper'), color('surface'), color(`${status}-soft`)],
    minimum: 4.5,
  })),
  // Accent as text: links in reading copy, on paper, surface and accent-soft.
  {
    inks: [color('accent-ink')],
    surfaces: [color('paper'), color('surface'), color('accent-soft')],
    minimum: 4.5,
  },
  // Labels on fills: the primary button and its hover.
  { inks: [color('on-ink')], surfaces: [color('ink'), color('ink-hover')], minimum: 4.5 },
  // Marks: Flare and the focus ring.
  { inks: [color('accent'), color('focus')], surfaces: GROUNDS, minimum: 3 },
  // The website's control marks; the app's field edges are quieter by design.
  { inks: [color('line-control')], surfaces: GROUNDS, minimum: 3, websiteOnly: true },
];

/*
 * The app's palette, held on the app's scopes only:
 * text roles 4.5:1 on ground, surface, well and raised and under the hover
 * and pressed tints; status inks on every fill and their own wash; marks and
 * series 3:1.
 */
const APP_FILLS = ['ground', 'surface', 'well', 'raised'].map(color);
const APP_WASHES = ['accent', ...STATUSES].map((role) => color(`${role}-wash`));
const APP_SERIES = ['data-you', 'data-rival-1', 'data-rival-2', 'data-rival-3', 'data-rival-4'].map(
  color,
);
const APP_PAIRS = [
  { inks: ['ink', 'ink-2'].map(color), surfaces: APP_FILLS, minimum: 4.5 },
  {
    inks: ['ink', 'ink-2'].map(color),
    surfaces: ['state-hover', 'state-pressed'].map(color),
    over: APP_FILLS,
    minimum: 4.5,
  },
  { inks: [color('ink')], surfaces: APP_WASHES, minimum: 4.5 },
  ...STATUSES.map((status) => ({
    inks: [color(status)],
    surfaces: [...APP_FILLS, color(`${status}-wash`)],
    minimum: 4.5,
  })),
  { inks: [color('accent-text')], surfaces: [...APP_FILLS, color('accent-wash')], minimum: 4.5 },
  // The rule is a translucent ink, so it is checked over every fill it can sit on.
  { inks: [color('ink-2')], surfaces: [color('rule')], over: APP_FILLS, minimum: 4.5 },
  {
    inks: [color('accent'), ...APP_SERIES, color('data-other')],
    surfaces: APP_FILLS,
    minimum: 3,
  },
].map((row) => ({ ...row, appOnly: true }));
CONTRAST_PAIRS.push(...APP_PAIRS);

/**
 * Every ink and every surface token the contrast matrix reads, so a fixture
 * can bind a complete palette without restating the matrix row by row.
 * @public — imported by the scripts/ fixture tests.
 */
export function contrastRoles() {
  return {
    inks: [...new Set(CONTRAST_PAIRS.flatMap(({ inks }) => inks))],
    surfaces: [...new Set(CONTRAST_PAIRS.flatMap(({ surfaces }) => surfaces))],
  };
}

/**
 * Marks that must stay distinguishable without full colour vision: by
 * lightness alone, or by hue under both red–green deficiencies. Status hues
 * always ship beside an arrow, icon or word too.
 */
const MIN_LIGHTNESS_STEP = 15;
const MIN_SIMULATED_DISTANCE = 10;
const pairsOf = (tokens) =>
  tokens.flatMap((first, index) => tokens.slice(index + 1).map((second) => [first, second]));
const SEPARATED_SETS = [
  { name: 'positive and negative', pairs: [[color('positive'), color('negative')]] },
  { name: 'you and the rivals', pairs: pairsOf(APP_SERIES), appOnly: true },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, String.raw`\$&`);
}

/** Top-level rules as `{ selectors, body }`; nested blocks are skipped whole. */
function topLevelRules(clean) {
  const rules = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const open = clean.indexOf('{', cursor);
    if (open === -1) break;
    let depth = 1;
    let close = open + 1;
    while (close < clean.length && depth > 0) {
      if (clean[close] === '{') depth += 1;
      if (clean[close] === '}') depth -= 1;
      close += 1;
    }
    // A preceding at-statement (`@import …;`) is not part of the selector.
    const prelude = clean.slice(cursor, open).split(';').at(-1).trim();
    rules.push({
      selectors: prelude.split(',').map((part) => part.replace(/\s+/g, ' ').trim()),
      body: clean.slice(open + 1, close - 1),
    });
    cursor = close;
  }
  return rules;
}

/**
 * A rule body's own `--token: value;` declarations, skipping nested blocks.
 * Split on `;` rather than scanned with one regex, so parsing stays linear.
 */
function customProperties(body) {
  const segments = body.replace(/\{[^{}]*\}/g, ';').split(';');
  return segments.flatMap((segment) => {
    const colon = segment.indexOf(':');
    const token = segment.slice(0, colon).trim();
    const value = segment.slice(colon + 1).trim();
    return colon > 0 && /^--[\w-]+$/.test(token) && value ? [[token, value]] : [];
  });
}

/**
 * The raw declared value of every token a scope sees, before alias
 * resolution: `@theme` and `:root` for light, then each rebinding block on
 * top in order. `selector` is one block's selector or the list of them.
 */
export function paletteDeclarations(source, selector) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = topLevelRules(clean);
  const declarations = (scope) =>
    rules
      .filter(({ selectors }) => selectors.includes(scope))
      .flatMap(({ body }) => customProperties(body));
  const layers = (Array.isArray(selector) ? selector : [selector]).filter(
    (layer) => layer !== LIGHT,
  );
  return new Map([
    ...declarations('@theme'),
    ...declarations('@theme inline'),
    ...declarations(LIGHT),
    ...layers.flatMap((layer) => declarations(layer)),
  ]);
}

/**
 * A colour literal as `#rrggbb` when opaque and `rgb(r g b / a%)` when
 * translucent, which `composite` lays on the surface beneath it. Any other
 * value stays as written.
 */
function hexOf(value) {
  const colour = parseColour(value);
  return colour ? formatColour(colour) : value;
}

/** `oklch(from var(--token) l c h / a)`: the token's colour at a new alpha. */
const RELATIVE = /^oklch\(\s*from\s+var\((--[\w-]+)\)\s+l\s+c\s+h\s*(?:\/\s*([\d.]+)%\s*)?\)$/;

/** Resolve `var()` aliases and relative colours for every token a scope sees. */
export function resolvePalette(source, selector) {
  const values = paletteDeclarations(source, selector);
  const resolve = (token, seen = new Set()) => {
    if (seen.has(token)) return undefined;
    seen.add(token);
    const value = values.get(token);
    const alias = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
    if (alias) return resolve(alias, seen);
    const relative = RELATIVE.exec(value ?? '');
    if (!relative) return hexOf(value);
    const base = parseColour(resolve(relative[1], seen));
    if (!base) return undefined;
    const alpha = relative[2] === undefined ? base.alpha : Number(relative[2]) / 100;
    return formatColour({ rgb: base.rgb, alpha });
  };
  return new Map([...values.keys()].map((token) => [token, resolve(token)]));
}

/** An opaque hex for a token, composited onto `backdrop` when translucent. */
function opaque(palette, token, backdrop) {
  return composite(palette.get(token), backdrop);
}

/** The violation for one ink on one surface, or null when it reads. */
function inkViolation(palette, { scope, cssLabel, minimum }, inkToken, surfaceToken, surface) {
  const ink = opaque(palette, inkToken, surface);
  if (!isHex(ink) || !isHex(surface)) {
    return `${cssLabel}: ${scope} cannot resolve ${inkToken} on ${surfaceToken}`;
  }
  const ratio = contrastRatio(ink, surface);
  if (ratio < minimum) {
    return `${cssLabel}: ${scope} ${inkToken} on ${surfaceToken} is ${ratio.toFixed(2)}:1; needs ${minimum}:1`;
  }
  return null;
}

/** One contrast row's violations: each ink on each surface, over each of the row's grounds. */
function rowViolations(palette, { scope, cssLabel }, row) {
  const { inks, surfaces, over = [color('surface')], minimum } = row;
  return over.flatMap((groundToken) => {
    const ground = palette.get(groundToken);
    return surfaces.flatMap((surfaceToken) => {
      const surface = opaque(palette, surfaceToken, ground);
      // A row with several grounds names the one a failure sits on.
      const label = over.length > 1 ? `${surfaceToken} over ${groundToken}` : surfaceToken;
      return inks
        .map((inkToken) =>
          inkViolation(palette, { scope, cssLabel, minimum }, inkToken, label, surface),
        )
        .filter((violation) => violation !== null);
    });
  });
}

function contrastViolations(palette, { name: scope, website }, cssLabel) {
  return CONTRAST_PAIRS.filter(
    (row) => (website || !row.websiteOnly) && (!website || !row.appOnly),
  ).flatMap((row) => rowViolations(palette, { scope, cssLabel }, row));
}

function separationViolations(palette, { name: scope, website }, cssLabel) {
  const base = palette.get(color('surface'));
  const violations = [];
  for (const { name, pairs, appOnly } of SEPARATED_SETS) {
    if (appOnly && website) continue;
    for (const [firstToken, secondToken] of pairs) {
      const first = opaque(palette, firstToken, base);
      const second = opaque(palette, secondToken, base);
      if (!isHex(first) || !isHex(second)) {
        violations.push(`${cssLabel}: ${scope} cannot resolve ${firstToken} / ${secondToken}`);
        continue;
      }
      const gap = separation(first, second);
      const separable =
        gap.lightness >= MIN_LIGHTNESS_STEP ||
        (gap.deuteranopia >= MIN_SIMULATED_DISTANCE && gap.protanopia >= MIN_SIMULATED_DISTANCE);
      if (!separable) {
        violations.push(
          `${cssLabel}: ${scope} ${name} ${firstToken} / ${secondToken} are too close ` +
            `(ΔL* ${gap.lightness.toFixed(1)}, deuteranopia ΔE ${gap.deuteranopia.toFixed(1)}, ` +
            `protanopia ΔE ${gap.protanopia.toFixed(1)})`,
        );
      }
    }
  }
  return violations;
}

/**
 * The whole matrix for a token stylesheet's text, in both themes.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function paletteViolations(source, cssLabel = TOKEN_CSS) {
  const violations = [];
  if (
    !new RegExp(escapeRegExp(DARK) + String.raw`\s*\{`).test(
      source.replace(/\/\*[\s\S]*?\*\//g, ''),
    )
  ) {
    violations.push(`${cssLabel}: dark theme token mapping is missing`);
  }
  for (const scope of SCOPES) {
    const palette = resolvePalette(source, scope.layers);
    violations.push(
      ...contrastViolations(palette, scope, cssLabel),
      ...separationViolations(palette, scope, cssLabel),
    );
  }
  return violations;
}

export function textContrastViolations(root) {
  const cssPath = join(root, ...TOKEN_CSS.split('/'));
  const cssLabel = relative(root, cssPath);
  return paletteViolations(readFileSync(cssPath, 'utf8'), cssLabel);
}
