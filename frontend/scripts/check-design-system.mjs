import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import { TOKEN_FILES, textContrast } from './design-system-contrast.mjs';
import { ancestorRuleFindings } from './design-system-composition.mjs';
import { mergeRolesFindings } from './design-system-merge-roles.mjs';
import {
  duplicateTokenFindings,
  unreadTokenFindings,
  variantAncestorFindings,
} from './design-system-tokens.mjs';
import { cssValueFindings, styleBlockFindings } from './design-system-css-values.mjs';
import { appSourceViolations } from './design-system-source-checks.mjs';
import { SCREEN_SOURCE, screenValueFindings } from './design-system-screen-values.mjs';

const root = resolve(import.meta.dirname, '..');
const tokenOwners = TOKEN_FILES.map((file) => join(root, ...file.split('/')));
const sourceExtensions = new Set(['.css', '.ts', '.tsx', '.js', '.mjs', '.astro']);
const ignored = new Set([
  'node_modules',
  'build',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
]);
const violations = [];
const scriptSources = [];
const sheets = [];
const readers = [];

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

for (const path of files(root)) {
  const extension = extname(path);
  if (!sourceExtensions.has(extension)) continue;
  const source = readFileSync(path, 'utf8');
  const label = relative(root, path);
  const generated = label.includes('.test.') || label.endsWith('.gen.ts');
  if (!label.startsWith('scripts/') && !generated) readers.push(source);
  if (extension === '.css' && !label.startsWith('scripts')) sheets.push({ label, css: source });
  if (extension === '.css') violations.push(...cssValueFindings(label, source));
  if (extension === '.astro') {
    violations.push(...styleBlockFindings(label, source));
    continue;
  }
  if (tokenOwners.includes(path)) continue;
  if (SCREEN_SOURCE.test(label)) violations.push(...screenValueFindings(label, source));
  if (/\.tsx?$/.test(label) && !/\.test\.tsx?$/.test(label)) scriptSources.push({ label, source });
}

const bootShell = join('apps', 'app', 'index.html');
const bootSource = readFileSync(join(root, bootShell), 'utf8');
readers.push(bootSource);
violations.push(...styleBlockFindings(bootShell, bootSource));

const appCssPath = join(root, 'apps', 'app', 'src', 'app.css');
const appCss = readFileSync(appCssPath, 'utf8');
const bundleOf = (label) => /marketing|apps\/docs|packages\//.exec(label)?.[0] ?? 'app';
const bundles = Map.groupBy(sheets, ({ label }) => bundleOf(label));
violations.push(
  ...textContrast(root),
  ...appSourceViolations(appCss, scriptSources),
  ...tokenOwners.flatMap((owner) =>
    ancestorRuleFindings(relative(root, owner), readFileSync(owner, 'utf8')),
  ),
  ...[...bundles.values()].flatMap((group) => duplicateTokenFindings(group)),
  ...unreadTokenFindings({ sheets, sources: readers }),
  ...sheets
    .filter(({ label }) => !label.includes('marketing'))
    .flatMap(({ label, css }) => variantAncestorFindings(label, css)),
  ...mergeRolesFindings(root),
);

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('CiteLadder design-system policy passed.');
