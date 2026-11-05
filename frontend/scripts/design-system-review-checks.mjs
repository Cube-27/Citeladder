import postcss from 'postcss';

import { lineIndex, parseSource, stringFragments } from './source-ast.mjs';

/**
 * The owner's 2026-11-05 review of the shipped app and docs (decisions D5–D9
 * in docs/plans/design-system-rollout.md), kept from coming back:
 *
 * - D5: fields, composers and cards wear the soft `line` edge (the xs ring a
 *   secondary Button wears), never the dark `line-control` hairline, which
 *   stays for marks too small to read without it;
 * - D6: Geist is never set above 500;
 * - D7: in the app Cal Sans is the page title's alone;
 * - D9: a row of equal figures is one row from 981px, never 2 × 2 or 2 + 1.
 *
 * D8 (a score is a ring or its number, never segmented bars) retires the bar
 * component outright; check-design-system.mjs lists its name as legacy.
 */

const TOKEN_CSS = 'apps/app/src/globals.css';

/** The website keeps its own type and edges; these decisions are the app's and the docs'. */
const isMarketing = (label) => /^(?:apps\/marketing\/|components\/marketing\/)/.test(label);
const inScope = (label) =>
  /^(?:apps\/app\/|apps\/docs\/|components\/|lib\/)/.test(label) && !isMarketing(label);
const isAppSource = (label) =>
  /^(?:apps\/app\/|components\/|lib\/)/.test(label) && !isMarketing(label);
const isScript = (label) => /\.(?:tsx|ts)$/.test(label) && !/\.(?:test|spec)\./.test(label);

/** Class-string findings, one per string fragment that matches `pattern`. */
function classFindings(source, label, pattern, message) {
  const lineOf = lineIndex(source);
  return stringFragments(parseSource(source, label))
    .filter(({ text }) => pattern.test(text))
    .map(({ start }) => `${label}:${lineOf(start)}: ${message}`);
}

// ── D6: Geist never above 500 ───────────────────────────────────────────────

const HEAVY_CLASS =
  /(?<![\w-])(?:[\w-]+:)*font-(?:semibold|bold|extrabold|black|\[(?:[6-9]00|bold|bolder)\])(?![\w-])/;
const HEAVY_VALUE = /^(?:[6-9]00|bold|bolder)$/;
const WEIGHT_MESSAGE = 'Geist is never set above 500 (decision D6); use a role or font-medium';

function weightClassFindings(source, label) {
  if (!inScope(label) || !isScript(label)) return [];
  return classFindings(source, label, HEAVY_CLASS, WEIGHT_MESSAGE);
}

function weightCssFindings(css, label) {
  const findings = [];
  postcss.parse(css).walkDecls(/^(?:font-weight|--[\w-]+--font-weight)$/, (decl) => {
    if (HEAVY_VALUE.test(decl.value.trim()))
      findings.push(`${label}:${decl.source?.start?.line ?? 0}: ${WEIGHT_MESSAGE}`);
  });
  return findings;
}

// ── D5: soft edges on fields, composers and cards ───────────────────────────

/**
 * Marks under 24px that need the 3:1 edge to read at all: the checkbox,
 * radio and switch, the pending step ring, chart rules and event markers,
 * the link underline, the split-pane handle, the neutral data swatch and the
 * dashed create tile.
 */
const LINE_CONTROL_OWNERS = new Set([
  'components/ui/checkbox.tsx',
  'components/ui/radio-group.tsx',
  'components/ui/switch.tsx',
  'components/ui/step-list.tsx',
  'components/ui/chart.tsx',
  'components/ui/trend-chart.tsx',
  'components/performance/performance-plot.tsx',
  'components/ui/text-link.tsx',
  'components/ui/split-pane.tsx',
  'components/ui/data-tone.ts',
  'components/ui/auth-shell.tsx',
]);
const LINE_CONTROL_CLASS = /(?<![\w-])(?:[\w-]+:)*[a-z]+-line-control(?![\w-])/;
const EDGE_MESSAGE =
  'line-control is for small marks only; a field, composer or card wears the soft xs ring (decision D5)';

function edgeClassFindings(source, label) {
  if (!inScope(label) || !isScript(label) || LINE_CONTROL_OWNERS.has(label)) return [];
  return classFindings(source, label, LINE_CONTROL_CLASS, EDGE_MESSAGE);
}

function edgeCssFindings(css, label) {
  const findings = [];
  postcss.parse(css).walkDecls((decl) => {
    if (/var\(--color-line-control\)/.test(decl.value))
      findings.push(`${label}:${decl.source?.start?.line ?? 0}: ${EDGE_MESSAGE}`);
  });
  return findings;
}

// ── D7: Cal Sans in the app is the page title's ─────────────────────────────

const DISPLAY_CLASS = /(?:^|\s)(?:[\w-]+:)*font-display(?=\s|$)/;
const DISPLAY_MESSAGE =
  'in the app Cal Sans is the page title alone (type-page-title, decision D7); use a Geist role';

function displayScopeClassFindings(source, label) {
  if (!isAppSource(label) || !isScript(label)) return [];
  return classFindings(source, label, DISPLAY_CLASS, DISPLAY_MESSAGE);
}

/** The app's roles in globals.css: only `.type-page-title` may set Cal Sans. */
function displayScopeCssFindings(css, label) {
  if (label !== TOKEN_CSS) return [];
  const findings = [];
  postcss.parse(css).walkDecls('font-family', (decl) => {
    const selector = decl.parent?.selector ?? '';
    const appRole = /(?:^|[\s,])\.(?:type|prose)-/.test(selector);
    if (
      appRole &&
      selector.trim() !== '.type-page-title' &&
      /var\(--font-display\)/.test(decl.value)
    )
      findings.push(`${label}:${decl.source?.start?.line ?? 0}: ${DISPLAY_MESSAGE}`);
  });
  return findings;
}

// ── D9: a row of figures is one row ─────────────────────────────────────────

const COLUMNS_AT = (prefix) => new RegExp(`(?<![\\w-])${prefix}:grid-cols-(\\d+)(?![\\w-])`);
const DESKTOP_COLUMNS = COLUMNS_AT('desktop');
const SHELL_COLUMNS = COLUMNS_AT('shell');
const ROW_MESSAGE =
  "a row of equal items holds its count from 981px (decision D9), never 2 × 2 or 2 + 1 at the owner's 982px";

/** A grid that adds columns between the desktop and shell breakpoints wraps at 982px. */
function metricRowClassFindings(source, label) {
  if (!isAppSource(label) || !isScript(label)) return [];
  const lineOf = lineIndex(source);
  return stringFragments(parseSource(source, label)).flatMap(({ text, start }) => {
    const desktop = DESKTOP_COLUMNS.exec(text)?.[1];
    const shell = SHELL_COLUMNS.exec(text)?.[1];
    return desktop && shell && Number(shell) > Number(desktop)
      ? [`${label}:${lineOf(start)}: ${ROW_MESSAGE}`]
      : [];
  });
}

/** Every stylesheet rule above, for one stylesheet or Astro `<style>` block. */
export function reviewStylesheetFindings(css, label) {
  if (!inScope(label)) return [];
  return [
    ...weightCssFindings(css, label),
    ...edgeCssFindings(css, label),
    ...displayScopeCssFindings(css, label),
  ];
}

/** Every class-string rule above, for one script. */
export function reviewScriptFindings(source, label) {
  return [
    ...weightClassFindings(source, label),
    ...edgeClassFindings(source, label),
    ...displayScopeClassFindings(source, label),
    ...metricRowClassFindings(source, label),
  ];
}
