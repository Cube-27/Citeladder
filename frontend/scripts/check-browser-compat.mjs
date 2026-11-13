import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcd from '@mdn/browser-compat-data' with { type: 'json' };
import { supportMatrix, unsupported } from './browser-support-data.mjs';
import { checkStylesheets } from './check-css-compat.mjs';
import { lineIndex, parseSource, walk } from './source-ast.mjs';

export { supportMatrix };

/**
 * Browser-compatibility gate: fails when browser source uses a web or
 * JavaScript API that a browser in the support matrix lacks, and runs the
 * stylesheet gate (`check-css-compat.mjs`) against the same matrix.
 *
 * The matrix is the `browserslist` in package.json, the one statement of
 * supported browsers; `apps/app/vite.config.ts` builds for it and
 * `public/browser-support.js` warns the browsers below it. Support data is
 * MDN's browser-compat-data.
 *
 * What it can see without types: global constructors and functions
 * (`new IntersectionObserver`, `structuredClone(...)`), static members
 * (`AbortSignal.any`, `URL.canParse`, `Promise.try`) and members of the
 * well-known global instances (`navigator.clipboard`, `document.startViewTransition`).
 * Instance methods on arbitrary values (`list.toSorted()`) are left to
 * TypeScript, whose `lib` in tsconfig.json stops at the matrix's ECMAScript
 * year. An API read only through optional chaining (`window.trustedTypes?.x`)
 * is feature-detected: the code handles its absence, so it passes.
 */

// Globals that are instances, mapped to the interface BCD files them under.
const GLOBAL_INSTANCES = {
  crypto: 'Crypto',
  document: 'Document',
  history: 'History',
  localStorage: 'Storage',
  location: 'Location',
  navigator: 'Navigator',
  performance: 'Performance',
  screen: 'Screen',
  sessionStorage: 'Storage',
};
const GLOBAL_SCOPES = new Set(['globalThis', 'self', 'window']);

// Browser source: the product app, the website's islands and the code they
// share. Worker code (`apps/*/src` server modules, `lib/server`) runs on
// Cloudflare, not in a reader's browser. Inline `<script>` in `.astro` files
// is not read.
const BROWSER_ROOTS = [
  'apps/app/src',
  'components',
  'lib',
  'packages/contracts/src',
  'packages/mcp-app/src',
];
const SERVER_ONLY = [/^lib\/server\//];
const NOT_SHIPPED = /(?:\.test\.|\.spec\.|\.d\.ts$|\/test\/)/;

function globalFeature(name) {
  return bcd.api[name] ?? bcd.javascript.builtins[name] ?? bcd.api.Window[name] ?? null;
}

function memberFeature(owner, property) {
  if (GLOBAL_SCOPES.has(owner)) return { label: property, feature: globalFeature(property) };
  const instance = GLOBAL_INSTANCES[owner];
  if (instance) return { label: `${owner}.${property}`, feature: bcd.api[instance]?.[property] };
  const feature =
    bcd.api[owner]?.[`${property}_static`] ??
    bcd.javascript.builtins[owner]?.[property] ??
    bcd.api[owner]?.[property];
  return { label: `${owner}.${property}`, feature };
}

function bindingNames(pattern, names) {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier':
      names.add(pattern.name);
      break;
    case 'ObjectPattern':
      for (const property of pattern.properties) {
        bindingNames(property.type === 'RestElement' ? property.argument : property.value, names);
      }
      break;
    case 'ArrayPattern':
      for (const element of pattern.elements) bindingNames(element, names);
      break;
    case 'AssignmentPattern':
      bindingNames(pattern.left, names);
      break;
    case 'RestElement':
      bindingNames(pattern.argument, names);
      break;
    case 'TSParameterProperty':
      bindingNames(pattern.parameter, names);
      break;
    default:
  }
}

// Every name the file declares anywhere. A local `URL` or `history` is not the
// browser's, so the gate leaves it alone rather than guess at scopes.
function declaredNames(program) {
  const names = new Set();
  walk(program, (node) => {
    switch (node.type) {
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        names.add(node.local.name);
        break;
      case 'VariableDeclarator':
        bindingNames(node.id, names);
        break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (node.id) names.add(node.id.name);
        for (const parameter of node.params) bindingNames(parameter, names);
        break;
      case 'ClassDeclaration':
        if (node.id) names.add(node.id.name);
        break;
      case 'CatchClause':
        bindingNames(node.param, names);
        break;
      default:
    }
  });
  return names;
}

// Expressions only ever used through `?.`: `x?.y` and `x?.()` handle a missing `x`.
function optionallyUsed(program) {
  const guarded = new Set();
  walk(program, (node) => {
    if (node.type === 'MemberExpression' && node.optional) guarded.add(node.object);
    if (node.type === 'CallExpression' && node.optional) guarded.add(node.callee);
  });
  return guarded;
}

/** Each API in `source` that a matrix browser lacks, once per API. */
export function compatViolations(source, label, matrix) {
  const program = parseSource(source, label);
  const declared = declaredNames(program);
  const guarded = optionallyUsed(program);
  const lineOf = lineIndex(source);
  const found = new Map();
  const report = (api, feature, node) => {
    if (found.has(api)) return;
    const missing = unsupported(feature, matrix);
    if (missing.length) found.set(api, { api, line: lineOf(node.start), missing });
  };
  const isGlobal = (node) => node?.type === 'Identifier' && !declared.has(node.name);

  walk(program, (node) => {
    if (
      (node.type === 'NewExpression' || node.type === 'CallExpression') &&
      isGlobal(node.callee) &&
      !guarded.has(node.callee)
    ) {
      report(node.callee.name, globalFeature(node.callee.name), node);
    }
    if (node.type === 'MemberExpression' && isGlobal(node.object) && !guarded.has(node)) {
      const owner = node.object.name;
      if (!GLOBAL_SCOPES.has(owner) && !GLOBAL_INSTANCES[owner]) {
        report(owner, globalFeature(owner), node);
      }
      if (!node.computed && node.property.type === 'Identifier') {
        const { label: api, feature } = memberFeature(owner, node.property.name);
        report(api, feature, node);
      }
    }
  });
  return [...found.values()];
}

function sourceFiles(root, directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : sourceFiles(root, relative);
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [relative] : [];
  });
}

/** Violations across the browser source under `root`, as printable lines. */
export function checkBrowserSource(root, matrix) {
  const failures = [];
  const files = [
    ...BROWSER_ROOTS.flatMap((directory) => sourceFiles(root, directory)),
    'public/browser-support.js',
  ];
  for (const file of files) {
    if (NOT_SHIPPED.test(file) || SERVER_ONLY.some((pattern) => pattern.test(file))) continue;
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    for (const violation of compatViolations(source, file, matrix)) {
      failures.push(
        `${file}:${violation.line} uses ${violation.api}, missing in ${violation.missing.join(', ')}.`,
      );
    }
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const queries = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).browserslist;
  const matrix = supportMatrix(queries);
  const failures = [...checkBrowserSource(root, matrix), ...checkStylesheets(root, matrix)];
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(
      'These features are newer than the browserslist in package.json. Use an older one, guard it (`?.` in scripts, `@supports` in CSS), acknowledge a CSS enhancement that degrades acceptably in check-css-compat.mjs, or raise the matrix with an owner decision.',
    );
    process.exit(1);
  }
  console.log('Browser compatibility gate passed.');
}
