import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'globals.css'), 'utf8');
const design = readFileSync(join(here, '..', '..', 'docs', 'design.md'), 'utf8');
const marketingCss = readFileSync(join(here, '(marketing)', 'marketing-theme.css'), 'utf8');

/* ═══════════════════════════════════════════════════════════════════════
   Parsing + WCAG helpers
   The suite parses the two theme blocks out of globals.css, resolves
   var()/hex/rgba/color-mix values to sRGB colors (compositing translucent
   fills over the theme's --bg-panel, where badges actually render), and
   computes WCAG 2.1 contrast ratios programmatically.
═══════════════════════════════════════════════════════════════════════ */

type Rgba = { r: number; g: number; b: number; a: number };

/** Extract the brace-matched body of the first block whose opener matches. */
function extractBlock(source: string, opener: RegExp): string {
  const m = opener.exec(source);
  if (!m) throw new Error(`block not found: ${opener}`);
  let i = m.index + m[0].length; // just past the opening brace
  let depth = 1;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  return source.slice(start, i - 1);
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
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
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

  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) {
    return { ...hexToRgb(v), a: 1 };
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

/** Hue (degrees) of an opaque color, for the royal-blue family assertion. */
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

/* ── Theme token maps ────────────────────────────────────────────────── */
const lightTokens = parseDeclarations(extractBlock(css, /:root\s*\{/));
const darkOverrides = parseDeclarations(extractBlock(css, /html\[data-theme='dark'\]\s*\{/));
// Dark inherits every shared :root token it does not override.
const darkTokens = new Map([...lightTokens, ...darkOverrides]);

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
  // The destructive button paints its label on its own fill token, not on a
  // wash and not on `--danger` (white fails AA there), so that pair needs its
  // own gate (buttonVariants.destructive).
  ['danger-fg', 'danger-solid'],
  ['danger-fg', 'danger-solid-hover'],
  ['accent-text', 'bg-panel'],
  ['accent-text', 'bg-base'],
  ['text-link', 'bg-panel'],
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
  });

  it('declares every raw --token documented in design.md (app sections)', () => {
    // The marketing creative-system section documents the --mkt-* namespace
    // that lives in app/(marketing)/marketing.css, not globals.css — exclude
    // it from the app name-set sync (checked against marketing.css below).
    const sections = design.split(/^## /m);
    const appSections = sections.filter(
      (s) => !/^(?:\d+[.:]?\s+)?marketing creative system/i.test(s.trim()),
    );
    const appDesign = appSections.join('\n## ');

    const declared = new Set<string>();
    for (const m of appDesign.matchAll(/--([a-z0-9-]+)\s*:/gi)) {
      declared.add(m[1]);
    }
    expect(declared.size).toBeGreaterThan(80);

    const missing: string[] = [];
    for (const name of declared) {
      const re = new RegExp(`--${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
      if (!re.test(css)) missing.push(name);
    }
    expect(missing, `Tokens in design.md missing from globals.css: ${missing.join(', ')}`).toEqual(
      [],
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. Figma light palette — ported VERBATIM
═══════════════════════════════════════════════════════════════════════ */
describe('Figma light palette (verbatim port)', () => {
  it('anchors the accent on royal blue #2756FF', () => {
    expect(lightTokens.get('--accent')).toBe('var(--blue-500)');
    expect(lightTokens.get('--blue-500')).toBe('#2756ff');
  });

  it('declares the Figma blue ramp verbatim', () => {
    const expected: Record<string, string> = {
      '--blue-50': '#ebf0ff',
      '--blue-100': '#d5e2ff',
      '--blue-200': '#acc4ff',
      '--blue-300': '#7a9fff',
      '--blue-400': '#4972ff',
      '--blue-500': '#2756ff',
      '--blue-600': '#1a44eb',
      '--blue-700': '#1235cc',
      '--blue-800': '#0d28a0',
      '--blue-900': '#091e78',
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(lightTokens.get(name), name).toBe(value);
    }
  });

  it('declares the Figma neutral ramp verbatim', () => {
    const expected: Record<string, string> = {
      '--neutral-0': '#ffffff',
      '--neutral-50': '#f7f8fa',
      '--neutral-100': '#eff1f6',
      '--neutral-200': '#e2e5ee',
      '--neutral-300': '#c8cede',
      '--neutral-400': '#98a2be',
      '--neutral-500': '#667092',
      '--neutral-600': '#454e6e',
      '--neutral-700': '#2c3454',
      '--neutral-800': '#1a2040',
      '--neutral-900': '#0d1228',
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(lightTokens.get(name), name).toBe(value);
    }
  });

  it('maps the Figma surface/text/accent values onto the semantic tokens', () => {
    expect(opaqueColor('bg-base', lightTokens)).toMatchObject(hexToRgb('#F7F8FA'));
    expect(opaqueColor('bg-panel', lightTokens)).toMatchObject(hexToRgb('#FFFFFF'));
    expect(opaqueColor('bg-elevated', lightTokens)).toMatchObject(hexToRgb('#FFFFFF'));
    expect(opaqueColor('bg-well', lightTokens)).toMatchObject(hexToRgb('#EFF1F6'));
    expect(opaqueColor('bg-sidebar', lightTokens)).toMatchObject(hexToRgb('#FFFFFF'));
    expect(opaqueColor('text-primary', lightTokens)).toMatchObject(hexToRgb('#0D1228'));
    expect(opaqueColor('text-secondary', lightTokens)).toMatchObject(hexToRgb('#454E6E'));
    expect(opaqueColor('text-inverse', lightTokens)).toMatchObject(hexToRgb('#FFFFFF'));
    expect(opaqueColor('accent', lightTokens)).toMatchObject(hexToRgb('#2756FF'));
    expect(opaqueColor('accent-text', lightTokens)).toMatchObject(hexToRgb('#1A44EB'));
    expect(opaqueColor('accent-fg', lightTokens)).toMatchObject(hexToRgb('#FFFFFF'));
  });

  it('declares the Figma chart palette verbatim', () => {
    const expected = [
      '#2756ff',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#06b6d4',
      '#f97316',
      '#ec4899',
    ];
    expected.forEach((value, i) => {
      expect(lightTokens.get(`--chart-${i + 1}`), `--chart-${i + 1}`).toBe(value);
    });
    // The legacy series slots alias onto the chart palette.
    for (let i = 1; i <= 5; i += 1) {
      expect(lightTokens.get(`--series-${i}`)).toBe(`var(--chart-${i})`);
    }
  });

  it('aliases --text-link to --accent-text and declares NO --text-accent token', () => {
    expect(lightTokens.get('--text-link')).toBe('var(--accent-text)');
    expect(darkTokens.get('--text-link')).toBe('var(--accent-text)');
    expect(css).not.toMatch(/--text-accent\s*:/);
  });

  it('declares the new tokens: accent-active, score text/ring, hero/data sizes, shadows 1–4', () => {
    expect(lightTokens.get('--accent-active')).toBe('var(--blue-700)');
    for (const band of ['low', 'mid', 'good', 'high']) {
      expect(lightTokens.has(`--score-${band}-text`), `--score-${band}-text`).toBe(true);
      expect(lightTokens.has(`--score-${band}-ring`), `--score-${band}-ring`).toBe(true);
      expect(lightTokens.has(`--score-${band}-border`), `--score-${band}-border`).toBe(true);
    }
    for (const level of ['1', '2', '3', '4']) {
      expect(lightTokens.has(`--shadow-${level}`), `--shadow-${level}`).toBe(true);
    }
    expect(css).toMatch(/--text-hero:\s*3rem/); // 48px hero metric
    expect(css).toMatch(/--text-data-lg:\s*1\.375rem/); // 22px large mono data
  });

  it('drops the legacy green owned-citation identity (owned is Figma blue)', () => {
    expect(opaqueColor('citation-owned', lightTokens)).toMatchObject(hexToRgb('#2756FF'));
    expect(css).not.toMatch(/--citation-owned:\s*#0f9d76/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. Authored dark theme — §3a hard constraints
═══════════════════════════════════════════════════════════════════════ */
describe('authored dark theme (warm-charcoal dusk, never near-black)', () => {
  // Luminance floor excluding near-black: the rejected Figma midnight
  // (#09090F ≈ 0.0029) and the old CUBE27 scale (#050505 ≈ 0.0015) sit far
  // below it; the dusk base (#262522 ≈ 0.0185) clears it comfortably.
  const LUMINANCE_FLOOR = 0.007;

  it('keeps --bg-base above the not-near-black luminance floor', () => {
    const lum = relativeLuminance(opaqueColor('bg-base', darkTokens));
    expect(lum, `bg-base luminance ${lum.toFixed(4)} < floor ${LUMINANCE_FLOOR}`).toBeGreaterThan(
      LUMINANCE_FLOOR,
    );
  });

  it('orders surfaces by luminance: bg-base < bg-panel ≤ bg-elevated', () => {
    const base = relativeLuminance(opaqueColor('bg-base', darkTokens));
    const panel = relativeLuminance(opaqueColor('bg-panel', darkTokens));
    const elevated = relativeLuminance(opaqueColor('bg-elevated', darkTokens));
    expect(panel, `panel ${panel.toFixed(4)} <= base ${base.toFixed(4)}`).toBeGreaterThan(base);
    expect(
      elevated,
      `elevated ${elevated.toFixed(4)} < panel ${panel.toFixed(4)}`,
    ).toBeGreaterThanOrEqual(panel);
  });

  // The dark theme's accent is the warm-charcoal system's violet —
  // deliberately a different hue from the light theme's Figma royal blue.
  // Guarding the violet band keeps a future edit from silently drifting back
  // to blue or off into magenta.
  it('keeps the dark accent in the dusk violet family', () => {
    const hue = hueDegrees(opaqueColor('accent', darkTokens));
    expect(hue, `dark accent hue ${hue.toFixed(1)}° outside dusk violet family`).toBeGreaterThan(
      240,
    );
    expect(hue).toBeLessThan(265);
  });

  it('pins the authored warm-charcoal dark ramp', () => {
    // These values are the app's own dark identity. They were originally
    // shared with the marketing surface; marketing has since moved to the
    // light-only "Proof" system, so the app owns them outright — pinning them
    // keeps that migration from quietly dragging the app along with it.
    expect(opaqueColor('bg-base', darkTokens)).toMatchObject(hexToRgb('#262522'));
    expect(opaqueColor('bg-panel', darkTokens)).toMatchObject(hexToRgb('#2C2B28'));
    expect(opaqueColor('bg-elevated', darkTokens)).toMatchObject(hexToRgb('#353430'));
    expect(opaqueColor('text-primary', darkTokens)).toMatchObject(hexToRgb('#F4F2EB'));
  });

  it('uses a soft dark shadow stack (no crushed near-black shadows)', () => {
    for (const level of ['1', '2', '3', '4']) {
      const value = darkTokens.get(`--shadow-${level}`) ?? '';
      const alphas = [...value.matchAll(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)/g)].map(
        (m) => parseFloat(m[1]),
      );
      expect(alphas.length, `--shadow-${level} should cast from black`).toBeGreaterThan(0);
      for (const a of alphas) {
        expect(a, `--shadow-${level} black alpha ${a} is crushed`).toBeLessThanOrEqual(0.6);
      }
    }
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
   5. Marketing + auth creative system — the "Proof" contract
   (app/(marketing)/marketing-theme.css)

   Proof is light-only and independent of the app tokens: a warm paper
   canvas, exact ink, and four state hues that are rationed to states,
   provider identity and evidence marks.

   The rule this suite enforces is the one the deck itself kept breaking:
   a hue used as a FILL is not automatically legible as TEXT. Every state
   hue therefore ships in two forms — the mark (≥ 3:1, decorative) and the
   `-text` variant (≥ 4.5:1, safe for body copy). The deck's own values
   (#0A8F6A 3.7:1, #E95D39 3.2:1, #C98616 2.8:1, muted #737973 4.1:1) all
   failed as text, which is why the `-text` forms exist at all.

   Ratios are computed against the paper canvas — the lightest surface the
   surface ever paints text on, so passing here passes on white too.
═══════════════════════════════════════════════════════════════════════ */
const PROOF_PAPER = '#F5F5F0';

/** Text roles: must clear AA (4.5:1) on paper. */
const PROOF_TEXT_COLORS = [
  '#151715', // ink
  '#454A46', // ink-soft — body copy
  '#656B65', // ink-muted — meta, captions
  '#1257C4', // proof-text — links, active labels
  '#087354', // evidence-text — "verified"
  '#B23A1A', // signal-text — decline, refusals
  '#8A5D0F', // amber-text — "needs review"
];

/**
 * Mark/fill roles: ≥ 3:1 so a 2px dot or bar stays visible, but explicitly
 * NEVER body text. Each one has a `-text` sibling above for that job.
 */
const PROOF_MARK_COLORS = [
  '#1668E8', // proof
  '#0A8F6A', // evidence
  '#E95D39', // signal
  '#BE7D12', // amber
];

describe('marketing + auth creative system (the Proof contract)', () => {
  it('design.md documents the paper canvas and the mark/text split', () => {
    const marketingSection = design
      .split(/^## /m)
      .find((s) => /^(?:\d+[.:]?\s+)?marketing creative system/i.test(s.trim()));
    expect(
      marketingSection,
      'design.md is missing the marketing creative-system section',
    ).toBeTruthy();
    expect(marketingSection).toContain(PROOF_PAPER);
    for (const color of PROOF_MARK_COLORS) {
      expect(marketingSection, `${color} mark role undocumented`).toContain(color);
    }
    expect(marketingSection?.toLowerCase()).toMatch(/mark|fill/);
  });

  it('is light-only: the retired dusk canvas is gone from the token file', () => {
    // Proof replaced the dark Signal/Dusk marketing identity outright. A dusk
    // value reappearing here means the two systems are being mixed again.
    expect(marketingCss.toLowerCase()).not.toContain('#1f1e1b');
    expect(marketingCss.toLowerCase()).not.toContain('#262522');
  });

  const canvas = { ...hexToRgb(PROOF_PAPER), a: 1 };

  it.each(PROOF_TEXT_COLORS)('text color %s on paper ≥ 4.5:1', (color) => {
    expect(marketingCss.toLowerCase(), `${color} is not declared`).toContain(color.toLowerCase());
    const ratio = contrastRatio({ ...hexToRgb(color), a: 1 }, canvas);
    expect(ratio, `${color} on ${PROOF_PAPER} = ${FMT(ratio)}:1 (< 4.5:1)`).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it.each(PROOF_MARK_COLORS)('mark/fill %s on paper ≥ 3:1 (never body text)', (color) => {
    expect(marketingCss.toLowerCase(), `${color} is not declared`).toContain(color.toLowerCase());
    const ratio = contrastRatio({ ...hexToRgb(color), a: 1 }, canvas);
    expect(ratio, `${color} on ${PROOF_PAPER} = ${FMT(ratio)}:1 (< 3:1)`).toBeGreaterThanOrEqual(3);
  });

  it('gives every state hue an AA-safe text sibling', () => {
    // Structural, not cosmetic: a hue with no `-text` form is one a future
    // section will inevitably use for copy, and it will fail AA silently.
    for (const role of ['proof', 'evidence', 'signal', 'amber']) {
      expect(marketingCss, `--color-mkt-${role} has no -text sibling`).toMatch(
        new RegExp(`--color-mkt-${role}-text\\s*:`),
      );
    }
  });
});
