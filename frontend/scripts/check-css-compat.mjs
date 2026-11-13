import fs from 'node:fs';
import path from 'node:path';
import bcd from '@mdn/browser-compat-data' with { type: 'json' };
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { unsupported } from './browser-support-data.mjs';

/**
 * Stylesheet half of the browser-compatibility gate (`pnpm check:compat`):
 * fails when authored CSS uses an at-rule, property, keyword value, function
 * or pseudo-class/element that a browser in the package.json browserslist
 * lacks, per MDN's browser-compat-data.
 *
 * A use passes when it is guarded: inside `@supports`, or a declaration that
 * follows another of the same property in its rule (the earlier one is the
 * fallback). Media query features and `<style>` in `.astro` files are not read.
 * Names BCD does not know (Tailwind's `@theme`, custom properties) pass.
 */

/**
 * Features below the matrix that degrade acceptably, each with what a browser
 * without it shows. An entry no stylesheet needs any more fails the gate, so
 * a matrix raise or a removal takes it out of this list.
 */
const ACKNOWLEDGED_ENHANCEMENTS = {
  '@starting-style': 'Menus, tooltips, toasts and drawers appear without their entry transition.',
  'text-wrap: balance': 'Headings wrap greedily.',
  'text-wrap: pretty': 'Paragraphs wrap greedily.',
  'scrollbar-color': 'Scrollbars keep the platform colours.',
  'scrollbar-width': 'Scrollbars keep the platform width.',
  'scrollbar-gutter': 'The page does not reserve a scrollbar track.',
  '::-webkit-scrollbar': 'Firefox styles scrollbars through scrollbar-color instead.',
  '::-webkit-scrollbar-track': 'Firefox styles scrollbars through scrollbar-color instead.',
  '::-webkit-scrollbar-thumb': 'Firefox styles scrollbars through scrollbar-color instead.',
  'text-size-adjust': 'The browser keeps its own text inflation on phones.',
  'box-decoration-break': 'A highlight broken across lines loses its end padding.',
  'forced-color-adjust': 'Browsers without a forced colours mode never apply it.',
  '::selection': 'iOS Safari keeps its own selection colour.',
  'cursor: pointer': 'Touch screens have no pointer.',
  'cursor: not-allowed': 'Touch screens have no pointer.',
  'cursor: default': 'Touch screens have no pointer.',
};

const STYLE_ROOTS = ['apps', 'components', 'lib', 'packages'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.astro', 'public']);

// CSS functions by name: every `css.types` entry and each entry's members
// (`light-dark` sits under `color`).
const FUNCTIONS = new Map();
for (const [name, feature] of Object.entries(bcd.css.types)) FUNCTIONS.set(name, feature);
for (const type of Object.values(bcd.css.types)) {
  for (const [name, feature] of Object.entries(type)) {
    if (name !== '__compat' && !FUNCTIONS.has(name)) FUNCTIONS.set(name, feature);
  }
}

function guardedBySupports(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'supports') return true;
  }
  return false;
}

// A declaration after another of the same property in its rule, prefixed or
// not, is an enhancement over that fallback.
function hasFallback(declaration) {
  const siblings = declaration.parent?.nodes ?? [];
  const property = declaration.prop.replace(/^-[a-z]+-/, '');
  return siblings
    .slice(0, siblings.indexOf(declaration))
    .some((node) => node.type === 'decl' && node.prop.replace(/^-[a-z]+-/, '') === property);
}

function declarationFeatures(declaration) {
  const property = bcd.css.properties[declaration.prop];
  if (property && !property.__compat) return [];
  const features = [[declaration.prop, property]];
  valueParser(declaration.value).walk((token) => {
    if (token.type === 'function' && token.value) {
      features.push([`${token.value}()`, FUNCTIONS.get(token.value)]);
    }
    if (token.type === 'word' && property?.[token.value]?.__compat) {
      features.push([`${declaration.prop}: ${token.value}`, property[token.value]]);
    }
  });
  return features;
}

// The selector without attribute selectors and strings, whose colons are not pseudo-classes.
function bareSelector(selector) {
  let bare = '';
  let closing = null;
  for (const char of selector) {
    if (closing) {
      if (char === closing) closing = null;
    } else if (char === '[') closing = ']';
    else if (char === '"' || char === "'") closing = char;
    else bare += char;
  }
  return bare;
}

function selectorFeatures(selector) {
  const bare = bareSelector(selector);
  return [...bare.matchAll(/(::?)([a-zA-Z-]+)/g)].map(([, colons, name]) => [
    `${colons}${name}`,
    bcd.css.selectors[name],
  ]);
}

function nodeFeatures(node) {
  if (node.type === 'atrule') return [[`@${node.name}`, bcd.css['at-rules'][node.name]]];
  if (node.type === 'rule') return selectorFeatures(node.selector);
  if (node.type === 'decl' && !hasFallback(node)) return declarationFeatures(node);
  return [];
}

/** Each feature in a stylesheet that a matrix browser lacks, once per feature and line. */
export function cssCompatViolations(source, file, matrix) {
  const found = new Map();
  postcss.parse(source, { from: file }).walk((node) => {
    if (guardedBySupports(node)) return;
    for (const [feature, data] of nodeFeatures(node)) {
      const line = node.source?.start?.line ?? 0;
      const key = `${feature}@${line}`;
      // A property the matrix lacks makes its keyword values moot.
      const property = feature.includes(': ') && found.has(`${feature.split(': ')[0]}@${line}`);
      if (found.has(key) || property) continue;
      const missing = unsupported(data, matrix);
      if (missing.length) found.set(key, { feature, line, missing });
    }
  });
  return [...found.values()];
}

/**
 * Printable failures for `uses` (each `{ file, feature, line, missing }`):
 * every unacknowledged use, and every acknowledgement nothing used.
 */
export function stylesheetFailures(uses, acknowledged = ACKNOWLEDGED_ENHANCEMENTS) {
  const failures = uses
    .filter((use) => !Object.hasOwn(acknowledged, use.feature))
    .map(
      (use) => `${use.file}:${use.line} uses ${use.feature}, missing in ${use.missing.join(', ')}.`,
    );
  const used = new Set(uses.map((use) => use.feature));
  for (const feature of Object.keys(acknowledged)) {
    if (!used.has(feature)) {
      failures.push(
        `scripts/check-css-compat.mjs acknowledges ${feature}, which no stylesheet needs on this matrix; remove it.`,
      );
    }
  }
  return failures;
}

function stylesheets(root, directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : stylesheets(root, relative);
    }
    return entry.name.endsWith('.css') ? [relative] : [];
  });
}

/** Failures across the authored stylesheets under `root`, as printable lines. */
export function checkStylesheets(root, matrix) {
  const uses = STYLE_ROOTS.flatMap((directory) => stylesheets(root, directory)).flatMap((file) =>
    cssCompatViolations(fs.readFileSync(path.join(root, file), 'utf8'), file, matrix).map(
      (use) => ({ file, ...use }),
    ),
  );
  return stylesheetFailures(uses);
}
