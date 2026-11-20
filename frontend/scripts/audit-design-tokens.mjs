import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import postcss from 'postcss';

import { paletteDeclarations, resolvePalette } from './design-system-contrast.mjs';
import { readMarketingCss } from './marketing-css.mjs';
import { parseSource, stringFragments } from './source-ast.mjs';

/**
 * Token audit: globals.css stays the sole value authority, and this reads it.
 *
 *   (no flag)  print the colour inventory with each token's consumers
 *   --check    fail on stale docs/design.md token blocks
 *   --write    regenerate the docs/design.md token blocks from CSS
 */

const root = resolve(import.meta.dirname, '..');
const TOKEN_CSS = 'apps/app/src/globals.css';
/** The website's type roles: the page, section and card titles, lead, body and note. */
const WEBSITE_ROLE = /^\.cl-(?:(?:phero|lhero|shead|fcard)-title|lead|body|note)$/;
const MARKETING_SURFACE = '[data-marketing-surface]';
const WIDE_MEDIA = /min-width:\s*(?:768px|48rem)\)\s*and\s*\(max-width:\s*(?:1023px|63\.9375rem)/;
const DESIGN_DOC = '../docs/design.md';
const LIGHT = ':root';
const DARK = ":root[data-theme='dark']";
const CONSUMER_ROOTS = ['apps', 'components', 'lib'];
const ignored = new Set([
  'node_modules',
  'dist',
  'build',
  '.dev',
  '.astro',
  'coverage',
  'test-results',
  'playwright-report',
]);

const escaped = (value) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const byName = (left, right) => {
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(?:css|tsx?|astro)$/.test(path) || /\.(?:test|spec)\./.test(path)) return [];
    return [{ path: relative(root, path), text: readFileSync(path, 'utf8') }];
  });
}

/**
 * Read-only inventory; globals.css remains the sole value authority.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function tokenInventory(source) {
  const light = resolvePalette(source, LIGHT);
  const dark = resolvePalette(source, DARK);
  return [...light.keys()]
    .filter((token) => token.startsWith('--color-'))
    .sort(byName)
    .map((token) => ({
      token,
      light: light.get(token),
      dark: dark.get(token),
    }));
}

// Longer prefixes precede their stems so `border-x-…` names the x side's colour.
const COLOUR_PREFIXES = [
  'bg',
  'text',
  ...['x', 'y', 't', 'r', 'b', 'l', 's', 'e'].map((side) => `border-${side}`),
  'border',
  'ring-offset',
  'ring',
  'outline',
  'fill',
  'stroke',
  'divide',
  'decoration',
  'caret',
  'placeholder',
  'accent',
  'shadow',
  'inset-shadow',
  'inset-ring',
  'from',
  'via',
  'to',
];
const COLOUR_UTILITY = new RegExp(`^(?:${COLOUR_PREFIXES.join('|')})-(.+)$`);

/** Theme tokens a single Tailwind class can generate from. */
function utilityTokens(className) {
  const utility = className
    .split(':')
    .at(-1)
    .replace(/^[!-]+/, '')
    .replace(/!$/, '')
    .replace(/\/[\w.[\]]+$/, '');
  const tokens = [];
  const colour = COLOUR_UTILITY.exec(utility);
  if (colour) tokens.push(`--color-${colour[1]}`);
  const radius = /^rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?-(.+)$/.exec(utility);
  if (radius) tokens.push(`--radius-${radius[1]}`);
  const prefixed = /^(text|shadow|duration|ease)-(.+)$/.exec(utility);
  if (prefixed) {
    const family = { text: 'text', shadow: 'shadow', duration: 'motion', ease: 'ease' };
    tokens.push(`--${family[prefixed[1]]}-${prefixed[2]}`);
  }
  return tokens;
}

/** Literal text of a module: string and template fragments from its AST. */
const moduleStrings = (text, path) =>
  stringFragments(parseSource(text, path)).map((fragment) => fragment.text);

/** Every token name a source file consumes, by var(), utility or literal name. */
function consumedTokens({ path, text }) {
  const consumed = new Set();
  for (const [, token] of text.matchAll(/var\(\s*(--[\w-]+)/g)) consumed.add(token);
  const strings = /\.tsx?$/.test(path) ? moduleStrings(text, path) : [text];
  for (const value of strings) {
    for (const [token] of value.matchAll(/(?<![\w-])--[a-z][\w-]*/g)) {
      // A bare name in TS is a lookup (`getPropertyValue('--color-x')`); in
      // CSS the same match is a declaration, which is not consumption.
      if (/\.tsx?$/.test(path)) consumed.add(token);
    }
    for (const className of value.split(/[\s"'`{}();,]+/)) {
      for (const token of utilityTokens(className)) consumed.add(token);
    }
  }
  return consumed;
}

/**
 * One DESIGN.md token group as a fenced YAML block: `group:` then one
 * `name: value` line per token, with an optional trailing comment.
 */
const tokenBlock = (group, entries) =>
  [
    '```yaml',
    `${group}:`,
    ...entries.map(({ name, value, note }) => {
      const comment = note ? ` # ${note}` : '';
      return `  ${name}: ${value}${comment}`;
    }),
    '```',
  ].join('\n');
// Single quotes, as the repository's formatter writes YAML, so a formatted
// design.md stays current. No colour value contains a quote.
const quoted = (value) => `'${value}'`;

/** Resolve `var(--x)` chains and rem literals against a declaration map. */
function resolveLength(value, declarations, seen = new Set()) {
  if (!value) return value;
  const alias = /^var\((--[\w-]+)\)$/.exec(value.trim())?.[1];
  if (alias && !seen.has(alias) && declarations.has(alias)) {
    return resolveLength(declarations.get(alias), declarations, new Set([...seen, alias]));
  }
  // Convert whole rem words; splitting first keeps the match linear.
  return value
    .split(/([\s,()/]+)/)
    .map((word) => (/^-?[\d.]+rem$/.test(word) ? `${Number(word.slice(0, -3)) * 16}px` : word))
    .join('');
}

/** Which table column a rule's media query feeds: base, wide, or none. */
function typeColumn(media, wideMedia) {
  if (!media) return 'base';
  return wideMedia?.test(media) ? 'wide' : null;
}

/**
 * The light palette with the marketing surface's custom properties applied:
 * the base rule, then the rule inside `media` when one is given.
 */
function marketingScale(tokenCss, light, media = null) {
  const scale = new Map(light);
  const rules = [];
  postcss.parse(tokenCss).walkRules((rule) => {
    if (rule.selector.trim() !== MARKETING_SURFACE) return;
    const parent = rule.parent?.type === 'atrule' && rule.parent.name === 'media';
    rules.push({ rule, params: parent ? rule.parent.params : null });
  });
  const apply = ({ rule }) => rule.walkDecls(/^--/, (decl) => scale.set(decl.prop, decl.value));
  rules.filter(({ params }) => params === null).forEach(apply);
  if (media) rules.filter(({ params }) => params && media.test(params)).forEach(apply);
  return scale;
}

function typeRoles(css, selectorPart, declarations, wideMedia = null) {
  const roles = new Map();
  postcss.parse(css).walkRules((rule) => {
    const parts = rule.selector
      .replace(/^:where\(([\s\S]*)\)$/, '$1')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => selectorPart.test(part));
    if (!parts.length) return;
    const media =
      rule.parent?.type === 'atrule' && rule.parent.name === 'media' ? rule.parent.params : null;
    const column = typeColumn(media, wideMedia);
    if (!column) return;
    rule.walkDecls(/^(?:font-size|line-height)$/, (decl) => {
      for (const part of parts) {
        const role = roles.get(part) ?? { base: {}, wide: {} };
        role[column][decl.prop] = resolveLength(decl.value, declarations);
        roles.set(part, role);
      }
    });
  });
  return roles;
}

/** A type role as a DESIGN.md typography value: its size and line height. */
const typeValue = (metrics) => {
  const parts = [`fontSize: ${metrics['font-size']}`];
  if (metrics['line-height']) parts.push(`lineHeight: ${metrics['line-height']}`);
  return `{ ${parts.join(', ')} }`;
};
const typeEntry = (role, metrics) => ({
  name: role.slice(1),
  value: typeValue(metrics.base),
  note: metrics.wide?.['font-size']
    ? `768–1023px: ${metrics.wide['font-size']} / ${metrics.wide['line-height'] ?? 'inherit'}`
    : undefined,
});

/**
 * The fenced YAML token block for every generated region of docs/design.md.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function generatedBlocks(tokenCss, websiteCss) {
  const light = paletteDeclarations(tokenCss, LIGHT);
  const product = typeRoles(tokenCss, /^\.type-[\w-]+$/, light);
  // A website role reads the marketing surface's responsive sizes (globals.css):
  // its base column resolves them at desktop, its 768–1023px column where the
  // tablet override changes the result.
  const site = typeRoles(websiteCss, WEBSITE_ROLE, marketingScale(tokenCss, light));
  const tablet = typeRoles(websiteCss, WEBSITE_ROLE, marketingScale(tokenCss, light, WIDE_MEDIA));
  for (const [role, metrics] of site) {
    const wide = tablet.get(role)?.base ?? {};
    if (wide['font-size'] && wide['font-size'] !== metrics.base['font-size']) metrics.wide = wide;
  }
  const radii = [...light]
    .filter(([token]) => token.startsWith('--radius-') && !token.includes('*'))
    .map(([token, value]) => [token, resolveLength(value, light)])
    .sort(([, first], [, second]) => Number.parseFloat(first) - Number.parseFloat(second));
  const controls = [...light]
    .filter(([token]) =>
      /^--(?:control-|container-|nav-height|sidebar-width|menu-item-height|badge-height|table-row-height|table-header-height|tab-height|nav-item-height)/.test(
        token,
      ),
    )
    .map(([token, value]) => [token, resolveLength(value, light)]);
  const sized = (roles) =>
    [...roles]
      .filter(([, metrics]) => metrics.base['font-size'])
      .sort(([first], [second]) => byName(first, second))
      .map(([role, metrics]) => typeEntry(role, metrics));
  return new Map([
    [
      'tokens',
      tokenBlock(
        'colors',
        tokenInventory(tokenCss).map(({ token, light: day, dark: night }) => ({
          name: token.slice('--color-'.length),
          value: quoted(day),
          note: `dark ${quoted(night)}`,
        })),
      ),
    ],
    [
      'radii',
      tokenBlock(
        'rounded',
        radii.map(([token, value]) => ({ name: token.slice('--radius-'.length), value })),
      ),
    ],
    ['type', tokenBlock('typography', [...sized(product), ...sized(site)])],
    [
      'controls',
      tokenBlock(
        'spacing',
        controls.map(([token, value]) => ({ name: token.slice(2), value })),
      ),
    ],
  ]);
}

/**
 * Replace each `<!-- generated:NAME:start -->…<!-- generated:NAME:end -->`
 * region with its block. Reports regions whose text changed and markers that
 * are absent, so --check and --write share one reading of the document.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function refreshGeneratedBlocks(document, blocks) {
  let text = document;
  const stale = [];
  const missing = [];
  for (const [name, block] of blocks) {
    const pattern = new RegExp(
      String.raw`(<!-- generated:${escaped(name)}:start -->)([\s\S]*?)(<!-- generated:${escaped(name)}:end -->)`,
    );
    const match = pattern.exec(text);
    if (!match) {
      missing.push(name);
      continue;
    }
    // A blank line each side of the block, as the Markdown formatter leaves it.
    const fresh = `\n\n${block}\n\n`;
    if (match[2] !== fresh) stale.push(name);
    text = text.replace(pattern, (_, start, __, end) => `${start}${fresh}${end}`);
  }
  return { text, stale, missing };
}

function readSources(base) {
  return {
    tokenCss: readFileSync(join(base, TOKEN_CSS), 'utf8'),
    // The website's components, which own its type roles, across all their sheets.
    websiteCss: readMarketingCss(base),
    document: readFileSync(join(base, DESIGN_DOC), 'utf8'),
  };
}

/** design.md with every generated block rebuilt from the CSS. */
function refreshDesignDoc({ tokenCss, websiteCss, document }) {
  return refreshGeneratedBlocks(document, generatedBlocks(tokenCss, websiteCss));
}

/** Everything --check enforces, as violation strings. */
export function tokenAuditViolations(base = root) {
  const sources = readSources(base);
  const { stale, missing } = refreshDesignDoc(sources);
  return [
    ...stale.map(
      (name) =>
        `docs/design.md: generated ${name} block is stale; run node frontend/scripts/audit-design-tokens.mjs --write`,
    ),
    ...missing.map(
      (name) =>
        `docs/design.md: <!-- generated:${name}:start --> / <!-- generated:${name}:end --> markers are missing`,
    ),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv.slice(2).find((argument) => argument.startsWith('--'));
  if (mode === '--check') {
    const violations = tokenAuditViolations();
    if (violations.length) {
      console.error(violations.join('\n'));
      process.exit(1);
    }
    console.log('Design token blocks in docs/design.md are current.');
  } else if (mode === '--write') {
    const { text, stale, missing } = refreshDesignDoc(readSources(root));
    if (stale.length) writeFileSync(join(root, DESIGN_DOC), text);
    for (const name of missing)
      console.warn(`docs/design.md: generated ${name} markers are missing`);
    console.log(
      stale.length ? `Regenerated: ${stale.join(', ')}` : 'Generated blocks are current.',
    );
  } else {
    const { tokenCss } = readSources(root);
    const files = CONSUMER_ROOTS.flatMap((directory) => sourceFiles(join(root, directory)));
    const consumption = files.map((file) => ({ path: file.path, tokens: consumedTokens(file) }));
    const rows = tokenInventory(tokenCss).map((row) => ({
      ...row,
      consumers: consumption.filter(({ tokens }) => tokens.has(row.token)).map(({ path }) => path),
    }));
    console.log(JSON.stringify(rows, null, 2));
  }
}
