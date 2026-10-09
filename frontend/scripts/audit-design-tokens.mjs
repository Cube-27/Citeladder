import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import postcss from 'postcss';

import { paletteDeclarations, resolvePalette } from './design-system-contrast.mjs';
import { parseSource, stringValue, walk } from './source-ast.mjs';

/**
 * Token audit: globals.css stays the sole value authority, and this reads it.
 *
 *   (no flag)  print the colour inventory with each token's consumers
 *   --check    fail on duplicate values, unconsumed tokens and stale docs
 *   --write    regenerate the docs/design.md value tables from CSS
 */

const root = resolve(import.meta.dirname, '..');
const TOKEN_CSS = 'apps/app/src/globals.css';
const WEBSITE_CSS = 'apps/app/src/website-type.css';
const DESIGN_DOC = '../docs/design.md';
const LIGHT = ':root:not([data-public-surface])';
const DARK = ":root[data-theme='dark']";
const THEMES = [
  ['light', LIGHT],
  ['dark', DARK],
];
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

/** Families every declared token must have a consumer in. */
const AUDITED_FAMILY = /^--(?:color|tag|radius|shadow|elevation|motion|ease|text)-/;

/**
 * Colour tokens that deliberately share a value in a theme. Two tokens with
 * the same resolved value are otherwise one role under two names: either
 * alias one to the other with `var()`, or record the reason here.
 */
const SAME_AS = [
  {
    theme: 'light',
    tokens: [
      '--color-panel',
      '--color-elevated',
      '--color-input',
      '--color-on-inverse',
      '--color-accent-fg',
      '--color-danger-fg',
    ],
    reason:
      'paper, layers, fields and labels on solid fills are one white in light; dark splits them',
  },
  {
    theme: 'light',
    tokens: ['--color-foreground', '--color-surface-inverse', '--color-selection-fg'],
    reason: 'the inverse surface and the selected label are printed in the primary ink',
  },
  {
    theme: 'light',
    tokens: ['--color-danger', '--color-danger-solid', '--color-danger-text'],
    reason: 'the light danger red already passes 4.5:1 as mark, fill and text',
  },
  {
    theme: 'light',
    tokens: ['--color-accent', '--color-accent-text'],
    reason: 'forest passes 4.5:1 as text in light; dark lifts the text rung',
  },
  {
    theme: 'light',
    tokens: ['--color-border-subtle', '--color-track'],
    reason: 'the recessed track is drawn in the hairline tone in light',
  },
  {
    theme: 'dark',
    tokens: ['--color-foreground', '--color-surface-inverse', '--color-state-ink'],
    reason: 'dark inverts on the reading ink, and state tints mix that same ink into a surface',
  },
  {
    theme: 'dark',
    tokens: ['--color-background', '--color-on-inverse'],
    reason: 'a label on the dark inverse surface is cut out in the ground colour',
  },
  {
    theme: 'dark',
    tokens: ['--color-input', '--color-track'],
    reason: 'fields and selection tracks share one recessed fill in dark',
  },
];

/** Status and action values a chart series must never wear. */
const NON_SERIES =
  /^--color-(?:accent(?:-[\w-]+)?|(?:success|warning|danger|info|neutral)(?:-[\w-]+)?)$/;

const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    return [{ path: relative(root, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }];
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

/** Tokens reached by following `var()` aliases from `token`, itself included. */
function aliasChain(declarations, token) {
  const chain = new Set();
  let current = token;
  while (current && !chain.has(current)) {
    chain.add(current);
    current = declarations.get(current)?.match(/^var\((--[\w-]+)\)$/)?.[1];
  }
  return chain;
}

const sameAsAllowed = (sameAs, theme, first, second) =>
  sameAs.some(
    (group) =>
      (group.theme === theme || group.theme === 'both') &&
      group.tokens.includes(first) &&
      group.tokens.includes(second),
  );

/**
 * Colour tokens that resolve to one value in a theme without saying so.
 * Chart series may never equal a status or action value, with no exception.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function duplicateTokenFindings(source, sameAs = SAME_AS) {
  const findings = [];
  for (const [theme, selector] of THEMES) {
    const declarations = paletteDeclarations(source, selector);
    const palette = resolvePalette(source, selector);
    const tokens = [...palette.keys()].filter((token) => token.startsWith('--color-')).sort(byName);
    const valueOf = (token) => palette.get(token)?.replace(/\s+/g, ' ').toLowerCase();
    for (const [index, first] of tokens.entries()) {
      for (const second of tokens.slice(index + 1)) {
        if (!valueOf(first) || valueOf(first) !== valueOf(second)) continue;
        const series = [first, second].find((token) => token.startsWith('--color-chart-'));
        const other = series === first ? second : first;
        if (series && NON_SERIES.test(other)) {
          findings.push(
            `${TOKEN_CSS}: ${theme} ${series} equals ${other} (${valueOf(first)}); chart series never wear a status or action value`,
          );
          continue;
        }
        const firstChain = aliasChain(declarations, first);
        if ([...aliasChain(declarations, second)].some((token) => firstChain.has(token))) continue;
        if (sameAsAllowed(sameAs, theme, first, second)) continue;
        findings.push(
          `${TOKEN_CSS}: ${theme} ${first} and ${second} both resolve to ${valueOf(first)}; alias one with var() or record it in SAME_AS`,
        );
      }
    }
  }
  return findings;
}

/** Every custom property globals.css declares in an audited family. */
function declaredTokens(source) {
  const tokens = new Set();
  postcss.parse(source).walkDecls((decl) => {
    if (AUDITED_FAMILY.test(decl.prop) && !decl.prop.includes('*')) tokens.add(decl.prop);
  });
  return tokens;
}

const COLOUR_UTILITY =
  /^(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|divide|decoration|caret|placeholder|accent|shadow|inset-shadow|inset-ring|from|via|to)-(.+)$/;

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
function moduleStrings(text, path) {
  const strings = [];
  walk(parseSource(text, path), (node) => {
    const value =
      node.type === 'TemplateElement'
        ? (node.value.cooked ?? node.value.raw ?? '')
        : stringValue(node);
    if (value) strings.push(value);
  });
  return strings;
}

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
 * Declared tokens that no source file consumes.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function zeroConsumerTokens(source, files) {
  const consumed = new Set();
  for (const file of files) for (const token of consumedTokens(file)) consumed.add(token);
  return [...declaredTokens(source)]
    .filter((token) => {
      if (consumed.has(token)) return false;
      // `--text-sm--line-height` travels with the `text-sm` utility.
      const companion = /^(--text-[\w]+(?:-[a-z\d]+)*?)--[\w-]+$/.exec(token)?.[1];
      return !(companion && consumed.has(companion));
    })
    .sort(byName);
}

const px = (value) => {
  const rem = /^(-?[\d.]+)rem$/.exec(value);
  if (rem) return `${Number(rem[1]) * 16}px`;
  return value;
};
const cell = (value) => (value ? `\`${value}\`` : '—');
const table = (header, rows) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

/** Resolve `var(--x)` chains and rem literals against a declaration map. */
function resolveLength(value, declarations, seen = new Set()) {
  if (!value) return value;
  const alias = /^var\((--[\w-]+)\)$/.exec(value.trim())?.[1];
  if (alias && !seen.has(alias) && declarations.has(alias)) {
    return resolveLength(declarations.get(alias), declarations, new Set([...seen, alias]));
  }
  return value.replace(/(-?[\d.]+)rem\b/g, (_, number) => `${Number(number) * 16}px`);
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
    const column = media && wideMedia?.test(media) ? 'wide' : media ? null : 'base';
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

const typeCell = (metrics) =>
  metrics['font-size']
    ? `\`${metrics['font-size']} / ${metrics['line-height'] ?? 'inherit'}\``
    : '—';

/**
 * Markdown for every generated region of docs/design.md.
 * @public — also imported by the scripts/frontend fixture tests.
 */
export function generatedBlocks(tokenCss, websiteCss) {
  const light = paletteDeclarations(tokenCss, LIGHT);
  const publicScale = new Map(light);
  postcss.parse(websiteCss).walkRules((rule) => {
    if (
      rule.selector.replace(/\s+/g, ' ').trim() !==
      ':where([data-public-surface], [data-flow-surface])'
    )
      return;
    rule.walkDecls(/^--/, (decl) => publicScale.set(decl.prop, decl.value));
  });
  const product = typeRoles(tokenCss, /^\.type-[\w-]+$/, light);
  const site = typeRoles(
    websiteCss,
    /^\.(?:website-[\w-]+|flow-(?:title|group-title|help|meta))$/,
    publicScale,
    /min-width:\s*(?:768px|48rem)/,
  );
  const radii = [...light]
    .filter(([token]) => token.startsWith('--radius-') && !token.includes('*'))
    .map(([token, value]) => [token, resolveLength(value, light)])
    .sort(([, first], [, second]) => Number.parseFloat(first) - Number.parseFloat(second));
  const controls = [...light]
    .filter(([token]) =>
      /^--(?:control-height|menu-item-height|badge-height|table-row-height|table-header-height|tab-height|nav-item-height)/.test(
        token,
      ),
    )
    .map(([token, value]) => [token, resolveLength(value, light)]);
  return new Map([
    [
      'tokens',
      table(
        ['Token', 'Light', 'Dark'],
        tokenInventory(tokenCss).map(({ token, light: day, dark: night }) => [
          cell(token),
          cell(day),
          cell(night),
        ]),
      ),
    ],
    [
      'radii',
      table(
        ['Token', 'Value'],
        radii.map(([token, value]) => [cell(token), cell(px(value))]),
      ),
    ],
    [
      'type',
      table(
        ['Role', 'Surface', 'Size / line height', '≥768px'],
        [
          ...[...product]
            .sort(([first], [second]) => byName(first, second))
            .map(([role, metrics]) => [cell(role), 'product', typeCell(metrics.base), '—']),
          ...[...site]
            .sort(([first], [second]) => byName(first, second))
            .map(([role, metrics]) => [
              cell(role),
              'public',
              typeCell(metrics.base),
              typeCell(metrics.wide),
            ]),
        ],
      ),
    ],
    [
      'controls',
      table(
        ['Token', 'Value'],
        controls.map(([token, value]) => [cell(token), cell(value)]),
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
      `(<!-- generated:${escaped(name)}:start -->)([\\s\\S]*?)(<!-- generated:${escaped(name)}:end -->)`,
    );
    const match = pattern.exec(text);
    if (!match) {
      missing.push(name);
      continue;
    }
    const fresh = `\n${block}\n`;
    if (match[2].replaceAll('\r\n', '\n') !== fresh) stale.push(name);
    text = text.replace(pattern, (_, start, __, end) => `${start}${fresh}${end}`);
  }
  return { text, stale, missing };
}

function readSources(base) {
  return {
    tokenCss: readFileSync(join(base, TOKEN_CSS), 'utf8'),
    websiteCss: readFileSync(join(base, WEBSITE_CSS), 'utf8'),
    document: readFileSync(join(base, DESIGN_DOC), 'utf8'),
  };
}

/** Everything --check enforces, as violation strings. */
export function tokenAuditViolations(base = root) {
  const { tokenCss, websiteCss, document } = readSources(base);
  const files = CONSUMER_ROOTS.flatMap((directory) => sourceFiles(join(base, directory)));
  const { stale, missing } = refreshGeneratedBlocks(
    document,
    generatedBlocks(tokenCss, websiteCss),
  );
  return [
    ...duplicateTokenFindings(tokenCss),
    ...zeroConsumerTokens(tokenCss, files).map(
      (token) => `${TOKEN_CSS}: ${token} has no consumer; remove it or use it`,
    ),
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
    console.log('Design tokens are unique, consumed and documented.');
  } else if (mode === '--write') {
    const { tokenCss, websiteCss, document } = readSources(root);
    const { text, stale, missing } = refreshGeneratedBlocks(
      document,
      generatedBlocks(tokenCss, websiteCss),
    );
    if (stale.length) writeFileSync(join(root, DESIGN_DOC), text);
    for (const name of missing)
      console.warn(`docs/design.md: generated ${name} markers are missing`);
    console.log(
      stale.length ? `Regenerated: ${stale.join(', ')}` : 'Generated blocks are current.',
    );
  } else {
    const { tokenCss } = readSources(root);
    const files = CONSUMER_ROOTS.flatMap((directory) => sourceFiles(join(root, directory)));
    const rows = tokenInventory(tokenCss).map((row) => {
      const role = escaped(row.token.slice('--color-'.length));
      const consumption = new RegExp(
        `var\\(${escaped(row.token)}\\)|(?:bg|text|border|stroke|fill|from|via|to|ring|divide|decoration|outline|caret|placeholder|shadow)-${role}(?![\\w-])`,
      );
      return {
        ...row,
        consumers: files.filter(({ text }) => consumption.test(text)).map(({ path }) => path),
      };
    });
    console.log(JSON.stringify(rows, null, 2));
  }
}
