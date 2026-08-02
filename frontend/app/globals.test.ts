import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'globals.css'), 'utf8');
const dsCss = readFileSync(join(here, 'ds-tokens.css'), 'utf8');
const dsTypeCss = readFileSync(join(here, 'ds-type.css'), 'utf8');
const dsSpaceCss = readFileSync(join(here, 'ds-space.css'), 'utf8');
const appChromeCss = readFileSync(join(here, 'app-chrome.css'), 'utf8');
const layoutTsx = readFileSync(join(here, 'layout.tsx'), 'utf8');
const design = readFileSync(join(here, '..', '..', 'docs', 'design.md'), 'utf8');
const marketingCss = readFileSync(join(here, '(marketing)', 'marketing-theme.css'), 'utf8');
// The token source spans the owners: ds-tokens.css holds ADS values,
// globals.css maps colour semantics onto them, and ds-type.css / ds-space.css
// hold the type and space ladders that were split out of globals.css.
// Name-set checks span all of them.
const allCss = `${dsCss}\n${css}\n${dsTypeCss}\n${dsSpaceCss}\n${appChromeCss}`;

function buildEmittedCss(): string {
  const frontendRoot = join(here, '..');
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm build'] : ['build'];

  execFileSync(command, args, {
    cwd: frontendRoot,
    env: { ...process.env, BACKEND_ORIGIN: 'https://api.example.com' },
    stdio: 'pipe',
  });

  const chunksDir = join(frontendRoot, '.next', 'static', 'chunks');
  if (!existsSync(chunksDir)) throw new Error('Next build emitted no static CSS chunks');

  return readdirSync(chunksDir)
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(join(chunksDir, file), 'utf8'))
    .join('\n');
}

/* ═══════════════════════════════════════════════════════════════════════
   Parsing + WCAG helpers
   The suite parses the two theme blocks out of globals.css, resolves
   var()/hex/rgba/color-mix values to sRGB colors (compositing translucent
   fills over the theme's --bg-panel, where badges actually render), and
   computes WCAG 2.1 contrast ratios programmatically.
═══════════════════════════════════════════════════════════════════════ */

type Rgba = { r: number; g: number; b: number; a: number };

function extractBlockBody(source: string, bodyStart: number): string {
  let i = bodyStart;
  let depth = 1;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  return source.slice(start, i - 1);
}

/** Extract the brace-matched body of the first block whose opener matches. */
function extractBlock(source: string, opener: RegExp): string {
  const match = opener.exec(source);
  if (!match) throw new Error(`block not found: ${opener}`);
  return extractBlockBody(source, match.index + match[0].length);
}

/** Extract every matching block so token declarations may be split safely. */
function extractBlocks(source: string, opener: RegExp): string[] {
  const matcher = new RegExp(
    opener.source,
    opener.flags.includes('g') ? opener.flags : `${opener.flags}g`,
  );
  const blocks = Array.from(source.matchAll(matcher), (match) =>
    extractBlockBody(source, (match.index ?? 0) + match[0].length),
  );
  if (blocks.length === 0) throw new Error(`block not found: ${opener}`);
  return blocks;
}

/** Parse `--name: value;` declarations from a CSS block body. */
function parseDeclarations(block: string): Map<string, string> {
  const map = new Map<string, string>();
  const stripped = block.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of stripped.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    map.set(m[1].toLowerCase(), m[2].trim());
  }
  return map;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 || h.length === 4 ? [...h].map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Alpha channel of a #RGBA / #RRGGBBAA hex, or 1 when there is none. The ADS
 * port made this necessary: Atlassian states every translucent token as 8-digit
 * hex (`--ds-border: #091E4224`) rather than rgba(), and the old resolver only
 * understood 3- and 6-digit forms, so those tokens silently resolved to null.
 */
function hexAlpha(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length === 4) return parseInt(h[3] + h[3], 16) / 255;
  if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255;
  return 1;
}

/**
 * Resolve a token to a concrete color. Handles hex, rgb()/rgba(), var()
 * chains (with fallbacks), and the documented `color-mix(in srgb, X n%,
 * transparent)` derivation (alpha scaled by n%). Returns null for
 * non-color values (shadow stacks, sizes, `none`, …).
 */
function resolveColor(name: string, tokens: Map<string, string>, depth = 0): Rgba | null {
  if (depth > 12) return null;
  const raw = tokens.get(name.startsWith('--') ? name : `--${name}`);
  if (!raw) return null;
  return resolveValue(raw, tokens, depth);
}

function resolveValue(value: string, tokens: Map<string, string>, depth: number): Rgba | null {
  const v = value.trim();

  const varMatch = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/i.exec(v);
  if (varMatch) {
    const resolved = resolveColor(varMatch[1], tokens, depth + 1);
    if (resolved) return resolved;
    return varMatch[2] ? resolveValue(varMatch[2], tokens, depth + 1) : null;
  }

  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
    return { ...hexToRgb(v), a: hexAlpha(v) };
  }

  const rgbMatch =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(v);
  if (rgbMatch) {
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%') ? parseFloat(rgbMatch[4]) / 100 : parseFloat(rgbMatch[4]);
    }
    return {
      r: parseFloat(rgbMatch[1]),
      g: parseFloat(rgbMatch[2]),
      b: parseFloat(rgbMatch[3]),
      a,
    };
  }

  // color-mix(in srgb, <color> <n>%, transparent) — alpha scale.
  const mixMatch = /^color-mix\(\s*in srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i.exec(
    v,
  );
  if (mixMatch) {
    const inner = resolveValue(mixMatch[1], tokens, depth + 1);
    if (!inner) return null;
    return { ...inner, a: inner.a * (parseFloat(mixMatch[2]) / 100) };
  }

  return null;
}

/** Alpha-composite a (possibly translucent) color over an opaque backdrop. */
function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

/** WCAG 2.1 relative luminance (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance). */
function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: Rgba, bg: Rgba): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Shortest angular distance between two hues, in degrees (0–180). Hue is
 * circular, so a plain `Math.abs(a - b)` overstates any pair straddling 0°: red
 * at 355° and orange at 30° are 35° apart, not 325°. Every hue comparison in
 * this suite goes through here so a genuine collision cannot pass by wrapping.
 */
function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

/** Hue (degrees) of an opaque color, for the accent-family assertions. */
function hueDegrees({ r, g, b }: Rgba): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}

/* ── Theme token maps ─────────────────────────────────────────────────
   Both files declare under the same two selectors, and resolution flows
   ds-tokens → globals, so each theme map is the ADS primitives with the
   semantic layer laid over them. A semantic token's var(--ds-*) chain can
   only be followed if both halves are in the same map. */
const dsLight = parseDeclarations(extractBlock(dsCss, /:root\s*\{/));
const dsDark = parseDeclarations(extractBlock(dsCss, /html\[data-theme='dark'\]\s*\{/));
const semanticLight = parseDeclarations(extractBlock(css, /:root\s*\{/));
const semanticDark = parseDeclarations(extractBlock(css, /html\[data-theme='dark'\]\s*\{/));

const lightTokens = new Map([...dsLight, ...semanticLight]);
// Dark inherits every shared token it does not override, at both layers.
const darkTokens = new Map([...lightTokens, ...dsDark, ...semanticDark]);

function resolvedPair(
  fgName: string,
  bgName: string,
  tokens: Map<string, string>,
): { fg: Rgba; bg: Rgba } {
  const fg = resolveColor(fgName, tokens);
  const panel = resolveColor('bg-panel', tokens);
  const bgRaw = resolveColor(bgName, tokens);
  if (!fg || !panel || !bgRaw) {
    throw new Error(`unresolvable pair ${fgName} on ${bgName}`);
  }
  // Text renders fully opaque; translucent fills composite over --bg-panel.
  const fgOpaque = compositeOver({ ...fg, a: Math.min(fg.a, 1) }, panel);
  const bg = bgRaw.a < 1 ? compositeOver(bgRaw, panel) : bgRaw;
  return { fg: { ...fgOpaque, a: 1 }, bg: { ...bg, a: 1 } };
}

function pairRatio(fgName: string, bgName: string, tokens: Map<string, string>): number {
  const { fg, bg } = resolvedPair(fgName, bgName, tokens);
  return contrastRatio(fg, bg);
}

/** Resolved opaque color for a token (composited over bg-panel if translucent). */
function opaqueColor(name: string, tokens: Map<string, string>): Rgba {
  const c = resolveColor(name, tokens);
  const panel = resolveColor('bg-panel', tokens);
  if (!c || !panel) throw new Error(`unresolvable token ${name}`);
  const out = c.a < 1 ? compositeOver(c, panel) : c;
  return { ...out, a: 1 };
}

/* ── The §3 contrast-gate pair list ──────────────────────────────────── */
// Body + accent pairs.
const BODY_PAIRS: Array<[string, string]> = [
  ['text-primary', 'bg-base'],
  ['text-primary', 'bg-panel'],
  ['text-secondary', 'bg-base'],
  ['text-secondary', 'bg-panel'],
  ['accent-fg', 'accent'],
  ['accent-fg', 'accent-hover'],
  // The destructive button paints its label on its own fill token, not on a
  // wash and not on `--danger` (white fails AA there), so that pair needs its
  // own gate (buttonVariants.destructive).
  ['danger-fg', 'danger-solid'],
  ['danger-fg', 'danger-solid-hover'],
  ['accent-text', 'bg-panel'],
  ['accent-text', 'bg-base'],
  // The sidebar active nav item and the empty-state icon chip paint
  // accent-hover on the deep accent-border fill (the clearly-visible
  // selected tint): 4.94:1 light, 6.11:1 dark. accent-text on the same
  // fill is 3.88:1 in light — sub-AA — which is why the label/icon uses
  // the darker rung and why this pair is gated.
  ['accent-hover', 'accent-border'],
  ['text-link', 'bg-panel'],
  ['text-link', 'bg-base'],
  // The inverse pair (tooltip surface): 7.65:1 in both themes.
  ['text-on-inverse', 'bg-inverse'],
];
// Each status/sentiment/score/run/citation *-text (or solid-as-text) on its *-bg.
const FAMILY_PAIRS: Array<[string, string]> = [
  ...['success', 'warning', 'danger', 'info'].map((f): [string, string] => [
    `${f}-text`,
    `${f}-bg`,
  ]),
  ...['positive', 'neutral', 'negative'].map((f): [string, string] => [
    `sentiment-${f}-text`,
    `sentiment-${f}-bg`,
  ]),
  ...['owned', 'competitor', 'third-party'].map((f): [string, string] => [
    `citation-${f}-text`,
    `citation-${f}-bg`,
  ]),
  // Run badges render the solid token as the text color (solid = Figma text).
  ...['draft', 'queued', 'running', 'analyzing', 'completed', 'partial', 'failed', 'cancelled'].map(
    (s): [string, string] => [`run-${s}`, `run-${s}-bg`],
  ),
  ...['low', 'mid', 'good', 'high'].map((b): [string, string] => [
    `score-${b}-text`,
    `score-${b}-bg`,
  ]),
];
const ALL_PAIRS = [...BODY_PAIRS, ...FAMILY_PAIRS];
// Decorative-only tokens: asserted present, never ratio-gated.
const DECORATIVE_ONLY = ['text-muted', 'text-subtle'];

const FMT = (n: number) => n.toFixed(2);

/* ═══════════════════════════════════════════════════════════════════════
   1. design.md ↔ globals.css name-set sync
═══════════════════════════════════════════════════════════════════════ */
describe('globals.css token set matches docs/design.md', () => {
  it('defines both theme blocks and the @theme bridge', () => {
    expect(css).toMatch(/:root\s*\{/);
    expect(css).toMatch(/html\[data-theme='dark'\]\s*\{/);
    expect(css).toMatch(/@theme inline\s*\{/);
    // The dark custom-variant makes `dark:` utilities real; it was silently
    // deleted once already, which turned every `dark:` class into a no-op.
    expect(css).toMatch(/@custom-variant dark \(&:where\(html\[data-theme='dark'\] \*\)\);/);
  });

  it('declares every raw --token documented in design.md (app sections)', () => {
    // The marketing creative-system section documents the --mkt-* namespace
    // that lives in app/(marketing)/marketing-theme.css — exclude it from the
    // app name-set sync (checked against that file below).
    const sections = design.split(/^## /m);
    const appSections = sections.filter(
      (s) => !/^(?:\d+[.:]?\s+)?marketing creative system/i.test(s.trim()),
    );
    const appDesign = appSections.join('\n## ');

    const declared = new Set<string>();
    for (const m of appDesign.matchAll(/--([a-z0-9-]+)\s*:/gi)) {
      declared.add(m[1]);
    }
    expect(declared.size).toBeGreaterThan(60);

    const missing: string[] = [];
    for (const name of declared) {
      const re = new RegExp(`--${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
      if (!re.test(allCss)) missing.push(name);
    }
    expect(
      missing,
      `Tokens in design.md missing from ds-tokens.css + globals.css: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps globals.css free of authored hex — the primitive layer owns values', () => {
    // The whole point of the split: globals.css names meanings, ds-tokens.css
    // holds Atlassian's values. A hex appearing here means someone authored a
    // colour into the semantic layer instead of adding an ADS primitive.
    const themeBlocks = [
      extractBlock(css, /:root\s*\{/),
      extractBlock(css, /html\[data-theme='dark'\]\s*\{/),
    ].join('\n');
    const hexes = [...themeBlocks.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/#[0-9a-f]{3,8}\b/gi)];
    expect(
      hexes.map((m) => m[0]),
      'globals.css theme blocks must reference var(--ds-*), not author hex',
    ).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. Atlassian palette — ported VERBATIM into ds-tokens.css
═══════════════════════════════════════════════════════════════════════ */
describe('Atlassian-based palette', () => {
  // The accent is one hue family across both themes, so a primary button means
  // one thing across the product. The VALUE is a design decision and is not
  // asserted here — only the indirection (so the dark theme keeps flipping for
  // free) and, in §6, the hue-family range that keeps it from drifting to
  // violet or cyan.
  it('resolves the accent through the ADS primitive layer in both themes', () => {
    expect(lightTokens.get('--accent')).toBe('var(--ds-background-brand-bold)');
    for (const tokens of [dsLight, dsDark]) {
      expect(tokens.has('--ds-background-brand-bold')).toBe(true);
    }
  });

  it('keeps the surface ladder strictly ascending in luminance in both themes', () => {
    // The invariant, not the values: a recessed canvas with panels above it is
    // what separates the surfaces. Retinting the deck is free; collapsing or
    // inverting two rungs is the regression worth catching — and only a real
    // luminance comparison catches it, which is why this resolves the colours
    // rather than asserting the names exist.
    for (const [label, tokens] of [
      ['light', dsLight],
      ['dark', dsDark],
    ] as const) {
      const ladder = ['--ds-surface-canvas', '--ds-surface', '--ds-surface-raised'];
      const lums = ladder.map((name) => {
        const value = tokens.get(name);
        expect(value, `${name} (${label}) must be declared`).toBeTruthy();
        const rgba = resolveValue(value ?? '', tokens, 0);
        expect(rgba, `${name} (${label}) must resolve to a colour`).toBeTruthy();
        return relativeLuminance(rgba!);
      });
      const shown = ladder.map((n, i) => `${n} ${lums[i].toFixed(4)}`).join(' → ');
      // In DARK the ladder ascends from a near-black canvas; in LIGHT the
      // canvas is the recessed step, so panels sit at or above it. Either way
      // it must never invert.
      expect(lums[0], `canvas is not below surface (${label}): ${shown}`).toBeLessThanOrEqual(
        lums[1],
      );
      expect(lums[1], `surface is above raised (${label}): ${shown}`).toBeLessThanOrEqual(lums[2]);
      expect(lums[0], `canvas equals raised — ladder collapsed (${label}): ${shown}`).toBeLessThan(
        lums[2],
      );
    }
  });

  it('keeps borders ALPHA so a hairline composes over any tint', () => {
    // The flat language leans entirely on 1px edges. An opaque border only
    // ever matches one surface, so the property that matters is translucency
    // and the two-tier ordering below — never the specific alpha.
    for (const tokens of [dsLight, dsDark]) {
      const border = resolveValue(tokens.get('--ds-border') ?? '', tokens, 0);
      expect(border?.a, 'ds-border must be translucent').toBeLessThan(1);
      const subtle = resolveValue(tokens.get('--ds-border-subtle') ?? '', tokens, 0);
      expect(subtle?.a, 'ds-border-subtle must be translucent').toBeLessThan(1);
      // Two REAL tiers: the subtle hairline is strictly weaker, so they can
      // never re-collapse onto one alpha the way Phase 1 collapsed them.
      expect(
        subtle!.a,
        `ds-border-subtle alpha (${subtle!.a}) must be strictly < ds-border (${border!.a})`,
      ).toBeLessThan(border!.a);
    }
  });

  it('resolves every semantic surface/text/accent token to a real colour', () => {
    // Structure, not values. A semantic token that resolves to nothing is the
    // failure this catches — the actual hues are a design decision, and the
    // WCAG suite below already gates the pairs that have to stay legible.
    for (const name of [
      'bg-base',
      'bg-panel',
      'bg-elevated',
      'bg-input',
      'bg-sidebar',
      'text-primary',
      'text-secondary',
      'text-muted',
      'text-inverse',
      'accent',
      'accent-text',
      'accent-fg',
    ]) {
      expect(opaqueColor(name, lightTokens), `--${name} must resolve to a colour`).toBeTruthy();
    }
  });

  it('gives the quiet-control ladder three distinct alpha depths', () => {
    // bg-alt / bg-well / bg-active used to collapse onto one value, which left
    // `neutral` and `ghost` buttons with no visible hover at all.
    const depths = ['bg-alt', 'bg-well', 'bg-active'].map((name) => {
      const c = resolveColor(name, lightTokens);
      expect(c, `--${name} must resolve`).toBeTruthy();
      return c!.a;
    });
    expect(new Set(depths).size, `alpha depths collapsed: ${depths.join(', ')}`).toBe(3);
    expect(depths[0]).toBeLessThan(depths[1]);
    expect(depths[1]).toBeLessThan(depths[2]);
  });

  it('composes the chart palette from the ADS accent ramp, one hue per slot', () => {
    const expected = ['blue', 'green', 'orange', 'red', 'purple', 'teal', 'yellow', 'magenta'];
    expected.forEach((hue, i) => {
      expect(lightTokens.get(`--chart-${i + 1}`), `--chart-${i + 1}`).toBe(
        `var(--ds-accent-${hue}-bolder)`,
      );
    });
    // The legacy series slots alias onto the chart palette.
    for (let i = 1; i <= 5; i += 1) {
      expect(lightTokens.get(`--series-${i}`)).toBe(`var(--chart-${i})`);
    }
  });

  it('closes the chart-tooltip foreground gap (was a literal text-white)', () => {
    // trend-chart.tsx painted its tooltip label with `text-white`, the one
    // untokenized colour left in the tree. It is a real token now, and it has
    // to stay legible on the inverse chip in BOTH themes — in dark the chip
    // goes light, so the foreground has to flip with it.
    for (const [name, tokens] of [
      ['light', lightTokens],
      ['dark', darkTokens],
    ] as const) {
      const ratio = pairRatio('chart-tooltip-fg', 'chart-tooltip-bg', tokens);
      expect(ratio, `${name} tooltip fg on bg = ${FMT(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('aliases --text-link to --accent-text and declares NO --text-accent token', () => {
    expect(semanticLight.get('--text-link')).toBe('var(--accent-text)');
    expect(css).not.toMatch(/--text-accent\s*:/);
  });

  it('declares score band text/ring/border and the ADS type ladder rungs', () => {
    for (const band of ['low', 'mid', 'good', 'high']) {
      expect(lightTokens.has(`--score-${band}-text`), `--score-${band}-text`).toBe(true);
      expect(lightTokens.has(`--score-${band}-ring`), `--score-${band}-ring`).toBe(true);
      expect(lightTokens.has(`--score-${band}-border`), `--score-${band}-border`).toBe(true);
    }
    // The type ladder lives in ds-type.css since the file split. Sizes are a
    // design decision (check-ads-scale.mjs owns the ladder's shape); what is
    // asserted here is that every rung ships its own line-height, since a size
    // token without one silently inherits and breaks vertical rhythm.
    for (const rung of ['--text-sm', '--text-hero']) {
      expect(allCss, `${rung} must be declared`).toMatch(new RegExp(`${rung}:\\s*[^;]+;`));
      expect(allCss, `${rung} must carry its own line-height`).toMatch(
        new RegExp(`${rung}--line-height:\\s*[^;]+;`),
      );
    }
  });

  it('declares the two-face typography policy: Inter UI + self-hosted Apfel display', () => {
    // Exactly two faces — Inter for UI/body/data (no monospace is shipped;
    // the mono family aliases Inter) and self-hosted Apfel Grotezk for
    // display across the app AND the marketing site.
    expect(css).toMatch(/--font-mono-family:\s*var\(--font-inter\)/);
    expect(css).toMatch(/--font-display-family:\s*'Apfel Grotezk'/);
    expect(marketingCss).toMatch(/--font-mkt-display:\s*var\(--font-display-family\)/);
    expect(layoutTsx).toMatch(/const inter = Inter\([\s\S]*?variable:\s*'--font-inter'/);
    expect(layoutTsx).not.toMatch(/Google_Sans|Plus_Jakarta_Sans|Geist|Space_Grotesk|Lora/);
    expect(layoutTsx).toMatch(/className=\{inter\.variable\}/);
    expect(css).toMatch(
      /@font-face\s*\{[\s\S]*?font-family:\s*'Apfel Grotezk';[\s\S]*?ApfelGrotezk-Mittel\.woff2[\s\S]*?font-weight:\s*500/,
    );
    expect(css).toMatch(
      /@font-face\s*\{[\s\S]*?ApfelGrotezk-Fett\.woff2[\s\S]*?font-weight:\s*600/,
    );
    expect(css).toMatch(
      /@font-face\s*\{[\s\S]*?ApfelGrotezk-Fett\.woff2[\s\S]*?font-weight:\s*700/,
    );
  });

  it('emits the intended font families and applies tabular numerals to font-mono at runtime', () => {
    // Runs a real Next build: the authored tokens above are only half the
    // contract — what ships has to resolve the same way, and `font-mono` has
    // to actually compute tabular numerals on an element.
    const emittedCss = buildEmittedCss();

    expect(emittedCss).toMatch(
      /--font-primary-family:var\(--font-inter\),\s*system-ui,\s*sans-serif/,
    );
    // The build normalizes the authored single quotes to double quotes.
    expect(emittedCss).toMatch(
      /--font-display-family:["']Apfel Grotezk["'],\s*var\(--font-inter\),\s*system-ui,\s*sans-serif/,
    );
    expect(emittedCss).not.toMatch(/--font-sans:var\(--font-sans\)/);
    expect(emittedCss).toMatch(
      /\.mono,\.font-mono,code,pre,kbd,samp\{[^}]*font-variant-numeric:tabular-nums/,
    );

    const style = document.createElement('style');
    style.textContent = emittedCss;
    document.head.append(style);
    const metric = document.createElement('span');
    metric.className = 'font-mono';
    document.body.append(metric);

    expect(getComputedStyle(metric).fontVariantNumeric).toBe('tabular-nums');

    metric.remove();
    style.remove();
  }, 180_000);

  it('declares NO letter-spacing tokens anywhere — ADS tracking is 0 at every step', () => {
    // The --tracking-* namespace was removed with the ADS ladder: no token in
    // any CSS layer may reintroduce it, and check-ads-scale.mjs bans the
    // utility classes in ts/tsx (zero ceiling).
    expect(allCss).not.toMatch(/--tracking-[a-z]+\s*:/);
    expect(allCss).not.toMatch(/--text-[a-z0-9-]+--letter-spacing\s*:/);
    expect(allCss).not.toMatch(/--text-data-lg\s*:/); // the retired 22px step
  });

  it('runs the score bands as four distinct hues, not two greens', () => {
    // The defect this guards: the old set spent `good` and `high` on two greens
    // (#10B981 / #22C55E) only 7° apart, so 50–74% and 75–100% were
    // near-indistinguishable at badge size. Now red → orange → teal → green.
    const bands = ['low', 'mid', 'good', 'high'] as const;
    const hues = bands.map((band) => hueDegrees(opaqueColor(`score-${band}-ring`, lightTokens)));
    const label = bands.map((b, i) => `${b} ${hues[i].toFixed(0)}°`).join(', ');

    // All four are different colours…
    expect(new Set(hues).size, `score ring hues collapsed: ${label}`).toBe(4);
    // …and the top two bands in particular are well clear of each other. Red and
    // orange sit closer in hue (≈23°) but separate strongly on lightness, which
    // is why this asserts the pair that actually regressed rather than a blanket
    // pairwise minimum.
    const gap = hueDistance(hues[3], hues[2]);
    expect(gap, `good/high too close to distinguish: ${label}`).toBeGreaterThan(25);
  });

  it('keeps owned citations on the accent and competitor off the warning hue', () => {
    // Owned citations track the accent — the relationship, not a literal hex,
    // so retuning the brand blue moves both together.
    const owned = hueDegrees(opaqueColor('citation-owned', lightTokens));
    const accent = hueDegrees(opaqueColor('accent', lightTokens));
    expect(
      hueDistance(owned, accent),
      `citation-owned ${owned.toFixed(0)}° has drifted off the accent ${accent.toFixed(0)}°`,
    ).toBeLessThan(15);
    // Competitor moved orange → magenta: warning is orange now, and a
    // competitor citation in the warning hue read as an error state.
    const competitor = hueDegrees(opaqueColor('citation-competitor', lightTokens));
    const warning = hueDegrees(opaqueColor('warning', lightTokens));
    expect(
      hueDistance(competitor, warning),
      `competitor ${competitor.toFixed(0)}° collides with the warning hue ${warning.toFixed(0)}°`,
    ).toBeGreaterThan(60);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. Elevation — the token half of the policy (docs/design.md §4a)
   The component half lives in scripts/check-elevation.mjs.
   The model: cards rest on the ADS raised rung (borderless — light, not an
   outline, separates the card), interactive cards lift to the overlay rung
   on hover, and true overlays hold the overlay rung. Nothing else casts.
═══════════════════════════════════════════════════════════════════════ */
describe('elevation (ADS raised + overlay)', () => {
  const RETIRED_RUNGS = ['shadow-xs-value', 'shadow-sm-value', 'shadow-elevated-value'];

  it.each(RETIRED_RUNGS)('--%s stays none — no third in-flow rung creeps back', (rung) => {
    expect(lightTokens.get(`--${rung}`)).toBe('none');
    expect(darkTokens.get(`--${rung}`)).toBe('none');
  });

  it('puts cards on the raised rung and the hover lift on the overlay rung', () => {
    for (const tokens of [lightTokens, darkTokens]) {
      expect(tokens.get('--shadow-card-value')).toBe('var(--ds-shadow-raised)');
      expect(tokens.get('--shadow-card-hover-value')).toBe('var(--ds-shadow-overlay)');
    }
  });

  it('keeps the raw ladder ordered: 1 flat, 2 raised, 3/4 overlay', () => {
    for (const tokens of [lightTokens, darkTokens]) {
      expect(tokens.get('--shadow-1')).toBe('none');
      expect(tokens.get('--shadow-2')).toBe('var(--ds-shadow-raised)');
      expect(tokens.get('--shadow-3')).toBe('var(--ds-shadow-overlay)');
      expect(tokens.get('--shadow-4')).toBe('var(--ds-shadow-overlay)');
      expect(tokens.get('--shadow-modal')).toBe('var(--ds-shadow-overlay)');
      expect(tokens.get('--shadow-lg-value')).toBe('var(--ds-shadow-overlay)');
    }
  });

  it('drops the dark catchlight ring the dusk theme relied on', () => {
    // The old dark stack ended every rung in `0 0 0 1px rgba(255,250,240,…)` —
    // a warm keyline compensating for surfaces that barely differed. The ADS
    // ladder separates its four steps by fill, so the ring has no job left.
    const overlay = dsDark.get('--ds-shadow-overlay') ?? '';
    expect(overlay, 'dark overlay shadow should exist').not.toBe('');
    expect(overlay).not.toContain('inset');
    expect(overlay).not.toMatch(/rgba\(\s*255\s*,\s*250\s*,\s*240/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3a. Dark theme — hard constraints (§6)
═══════════════════════════════════════════════════════════════════════ */
describe('dark theme (ADS, hard constraints)', () => {
  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
  ] as const)(
    'orders %s surfaces by luminance: bg-base < bg-panel ≤ bg-elevated',
    (_name, tokens) => {
      // The invariant the elevation model depends on: the tint ladder and
      // the shadow rungs always agree about which surface sits higher.
      const base = relativeLuminance(opaqueColor('bg-base', tokens));
      const panel = relativeLuminance(opaqueColor('bg-panel', tokens));
      const elevated = relativeLuminance(opaqueColor('bg-elevated', tokens));
      expect(panel, `panel ${panel.toFixed(4)} <= base ${base.toFixed(4)}`).toBeGreaterThan(base);
      expect(
        elevated,
        `elevated ${elevated.toFixed(4)} < panel ${panel.toFixed(4)}`,
      ).toBeGreaterThanOrEqual(panel);
    },
  );

  it('keeps the accent in ONE blue family across both themes', () => {
    // Reversal from the dusk system, which split the accent by theme on
    // purpose (royal blue light / violet dark). ADS uses one blue family
    // throughout, so the bands are guarded both ways: a later edit can drift
    // it neither to violet nor off into cyan.
    for (const [name, tokens] of [
      ['light', lightTokens],
      ['dark', darkTokens],
    ] as const) {
      const hue = hueDegrees(opaqueColor('accent', tokens));
      expect(
        hue,
        `${name} accent hue ${hue.toFixed(1)}° outside the ADS blue family`,
      ).toBeGreaterThan(200);
      expect(hue, `${name} accent hue ${hue.toFixed(1)}°`).toBeLessThan(230);
    }
  });

  it('keeps every chart slot on the same HUE across themes', () => {
    // Replaces the old "chart palette is not overridden in dark" rule. Series
    // identity means hue, not an exact value: holding one value for both
    // themes kept identity but cost legibility on the dark canvas. ADS ramps
    // are hue-stable, so lightness can move and identity still survives.
    for (let slot = 1; slot <= 8; slot += 1) {
      const light = hueDegrees(opaqueColor(`chart-${slot}`, lightTokens));
      const dark = hueDegrees(opaqueColor(`chart-${slot}`, darkTokens));
      const drift = hueDistance(light, dark);
      expect(
        drift,
        `--chart-${slot} hue drifts ${drift.toFixed(1)}° (${light.toFixed(0)}° → ${dark.toFixed(0)}°)`,
      ).toBeLessThan(6);
    }
  });

  it('records the two constraints deliberately dropped from the dusk system', () => {
    // Kept as an assertion rather than a deleted test, so the reversal is
    // visible to whoever wonders where these rules went.
    //
    // 1. The "never near-black" luminance floor (0.007). It was an aesthetic
    //    rule for the warm-charcoal deck (base #262522 ≈ 0.0185). ADS dark
    //    genuinely is near-black and we follow it.
    const base = relativeLuminance(opaqueColor('bg-base', darkTokens));
    expect(base, 'ADS dark canvas is intentionally near-black').toBeLessThan(0.007);
    // 2. The soft-shadow-stack rule — the dusk deck's bespoke four-rung stack
    //    is gone; dark uses the same two ADS rungs as light (raised + overlay).
    expect(darkTokens.get('--shadow-2')).toBe('var(--ds-shadow-raised)');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. Programmatic WCAG contrast suite — both themes, AA ≥ 4.5:1
   text-muted / text-subtle are decorative-only: asserted present but not
   ratio-gated (documented in design.md §4/§5).
═══════════════════════════════════════════════════════════════════════ */
describe.each([
  ['light', lightTokens],
  ['dark', darkTokens],
] as const)('WCAG AA contrast — %s theme', (themeName, tokens) => {
  it.each(ALL_PAIRS)('%s on %s ≥ 4.5:1', (fg, bg) => {
    const ratio = pairRatio(fg, bg, tokens);
    expect(
      ratio,
      `${themeName} --${fg} on --${bg} = ${FMT(ratio)}:1 (< 4.5:1)`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(DECORATIVE_ONLY)('--%s is present (decorative-only, not ratio-gated)', (name) => {
    expect(tokens.has(`--${name}`)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. Marketing creative system — the "Proof" legibility gate
   (app/(marketing)/marketing-theme.css)

   This suite deliberately does NOT freeze brand values. Hue choices are a
   design decision that changes freely, and a test hardcoding the paper hex
   only turns a redesign into a chore. Every colour below is resolved from
   whatever the token file currently declares, so retuning paper, ink or a
   state hue needs no edit here — only the ratios have to hold.

   The rule it does enforce is the one the deck itself kept breaking:
   a hue used as a FILL is not automatically legible as TEXT. Every state
   hue therefore ships in two forms — the mark (≥ 3:1, decorative) and the
   `-text` variant (≥ 4.5:1, safe for body copy).

   Blue is the one exemption: proof clears AA on paper as both mark and text,
   so it ships a single token and appears in BOTH role lists below. That is
   intentional — a `-text` sibling would be a duplicate, not a safety net.

   Ratios are measured against the paper canvas — the lightest surface the
   system paints text on, so passing there passes on white too — AND against
   the darker band fills (sunken, wash), which also take text. The paper gate
   alone once let muted ink ship as text on sunken, so the per-band lists
   below encode which text roles are legal on which fill.

   The gradient keyword is gated at the WCAG large-text threshold (3:1): it
   only ever paints display-scale headline words, and its light tail is the
   easiest thing in the system to make accidentally illegible.
═══════════════════════════════════════════════════════════════════════ */
/** Live token map for the marketing theme — values are read, never asserted. */
const mktTokens = parseDeclarations(extractBlocks(marketingCss, /@theme\s*\{/).join('\n'));

function mktColor(role: string): Rgba {
  const resolved = resolveColor(`--color-mkt-${role}`, mktTokens);
  if (!resolved) throw new Error(`--color-mkt-${role} is missing or not a colour`);
  return resolved;
}

/** The canvas every text role must stay legible on. */
const PAPER_ROLE = 'paper';

/** Text roles: must clear AA (4.5:1) on paper. */
const PROOF_TEXT_ROLES = [
  'ink', // headings
  'ink-soft', // body copy
  'indigo', // the AA-safe blue — links and active labels
  'success-text', // "verified"
  'error-text', // decline, refusals
  'warning-text', // "needs review"
];

/**
 * Band fills darker than paper that sections paint via `tone`. Every text
 * colour used on these fills must clear AA against the fill itself.
 */
const BAND_FILL_ROLES = ['surface-sunk', 'frost'] as const;

/**
 * Text roles legal on each band fill. The ink ramp and every `-text` sibling
 * clear AA on both fills, which is the point of the split: the mark hues are
 * excluded here by construction, not by exception.
 */
const BAND_TEXT_ROLES: Record<(typeof BAND_FILL_ROLES)[number], string[]> = {
  'surface-sunk': ['ink', 'ink-soft', 'indigo', 'success-text', 'error-text', 'warning-text'],
  frost: ['ink', 'ink-soft', 'indigo', 'success-text', 'error-text', 'warning-text'],
};

/**
 * Mark roles: ≥ 3:1 so a border or bar that CARRIES MEANING stays visible,
 * and explicitly never body text. Each has a `-text` sibling above.
 * `primary` is the spec's Primary Blue — 3.68:1, which is exactly why it
 * carries gradients and borders while `indigo` carries the copy.
 *
 * `success` (2.54:1) and `warning` (2.35:1) are deliberately NOT in this list.
 * The spec ships them as saturated brand fills for status dots and progress
 * bars — decoration that always sits beside its own text label, so no
 * information depends on the swatch alone. Gating them at 3:1 would mean
 * retuning two published brand values to protect a contrast nothing reads;
 * the rule that actually protects legibility is the `-text` sibling, which is
 * asserted below and is what every label on the surface uses.
 */
const PROOF_MARK_ROLES = ['primary', 'error'];

describe('marketing creative system (the Proof legibility gate)', () => {
  const canvas = mktColor(PAPER_ROLE);

  it.each(PROOF_TEXT_ROLES)('text role --color-mkt-%s on paper ≥ 4.5:1', (role) => {
    const ratio = contrastRatio(mktColor(role), canvas);
    expect(
      ratio,
      `--color-mkt-${role} on paper = ${FMT(ratio)}:1 (< 4.5:1)`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BAND_FILL_ROLES)('text roles on the --color-mkt-%s band fill ≥ 4.5:1', (band) => {
    const bandCanvas = mktColor(band);
    for (const role of BAND_TEXT_ROLES[band]) {
      const ratio = contrastRatio(mktColor(role), bandCanvas);
      expect(
        ratio,
        `--color-mkt-${role} on ${band} = ${FMT(ratio)}:1 (< 4.5:1)`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(PROOF_MARK_ROLES)('mark role --color-mkt-%s on paper ≥ 3:1 (never body text)', (role) => {
    const ratio = contrastRatio(mktColor(role), canvas);
    expect(ratio, `--color-mkt-${role} on paper = ${FMT(ratio)}:1 (< 3:1)`).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('keeps white legible on both gradient fills (buttons, CTA bands)', () => {
    // Both gradients carry white labels, so each stop has to hold on its own —
    // a gradient is only as legible as its lightest end.
    //
    // The bar is the FULL 4.5:1, not the large-text 3:1: the button label rung
    // is 15px/600, below the 18.66px-bold threshold WCAG exempts. This is why
    // the accent sweep starts at #2563EB rather than the spec's #3B82F6 —
    // that lighter blue gives white only 3.68:1 and stays a mark-only hue.
    const white = mktColor('paper');
    for (const stop of ['gradient-from', 'gradient-to', 'charcoal', 'black']) {
      const ratio = contrastRatio(white, mktColor(stop));
      expect(
        ratio,
        `white on --color-mkt-${stop} = ${FMT(ratio)}:1 (< 4.5:1 at the 15px/600 label rung)`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives every state hue an AA-safe text sibling', () => {
    // Structural, not cosmetic: a hue with no `-text` form is one a future
    // section will inevitably use for copy, and it will fail AA silently.
    // This is the rule that lets the spec's own fill values ship verbatim —
    // they stay marks, and the sibling carries the label.
    for (const role of ['success', 'error', 'warning']) {
      expect(marketingCss, `--color-mkt-${role} has no -text sibling`).toMatch(
        new RegExp(`--color-mkt-${role}-text\\s*:`),
      );
    }
  });
});
