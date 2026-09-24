import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import {
  editorialTypographyViolations,
  nestedCardViolations,
  directRadixImportViolations,
  productContractViolations,
  landingThemeViolations,
  productControlViolations,
  productUiSourceViolations,
  standalonePlaceholderViolations,
  textContrastViolations,
  rawRadiusViolations,
  styleAssertionViolations,
  textRoleBackgroundViolations,
  websiteContractViolations,
} from './design-system-source-checks.mjs';

const root = resolve(import.meta.dirname, '..');
const tokenOwner = join(root, 'apps', 'app', 'src', 'globals.css');
const sourceExtensions = new Set(['.css', '.ts', '.tsx', '.js', '.mjs']);
const ignored = new Set([
  'node_modules',
  'build',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
]);
const violations = [];

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

for (const path of files(root)) {
  if (!sourceExtensions.has(extname(path))) continue;
  const source = readFileSync(path, 'utf8');
  const label = relative(root, path).replaceAll('\\', '/');
  const legacyIdentifiers = [
    ['Search', 'ify'].join(''),
    ['search', 'ify'].join(''),
    ['--', 'ds-'].join(''),
    ['--', 'mkt-'].join(''),
    ['Theme', 'Toggle'].join(''),
    ['Public', ' Sans'].join(''),
    ['Public', '_Sans'].join(''),
    ['font', '-public-sans'].join(''),
    ['marketing', '-atmosphere'].join(''),
  ];
  for (const legacy of legacyIdentifiers) {
    if (source.includes(legacy)) violations.push(`${label}: legacy identifier ${legacy}`);
  }
  if (
    path !== tokenOwner &&
    path !== import.meta.filename &&
    /(?<![\w-])#[0-9a-f]{3,8}(?![\w-])/i.test(source)
  ) {
    violations.push(`${label}: raw color outside apps/app/src/globals.css`);
  }
  if (path !== tokenOwner && path !== import.meta.filename && /@theme\b/.test(source)) {
    violations.push(`${label}: @theme outside apps/app/src/globals.css`);
  }
  violations.push(
    ...directRadixImportViolations(source, label),
    ...styleAssertionViolations(source, label),
  );
  const ownsWebsiteEditorialCopy =
    !label.includes('.test.') &&
    ((label.startsWith('components/marketing/') &&
      !label.startsWith('components/marketing/scenes/')) ||
      label.startsWith('components/auth/') ||
      label.startsWith('components/onboarding/'));
  const ownsProductUi =
    !label.includes('.test.') &&
    !label.startsWith('components/marketing/') &&
    !label.startsWith('components/auth/') &&
    !label.startsWith('components/onboarding/') &&
    !label.startsWith('lib/marketing-content/') &&
    (label.startsWith('apps/app/src/') ||
      label.startsWith('components/') ||
      label.startsWith('lib/'));
  // Applies to every source file, not just product UI: the ESLint rule this
  // replaced was repository-wide, and a text-ink background is wrong on a
  // marketing surface too.
  violations.push(
    ...textRoleBackgroundViolations(source, label),
    ...rawRadiusViolations(source, label),
    ...editorialTypographyViolations(source, label, ownsWebsiteEditorialCopy),
    ...standalonePlaceholderViolations(source, label, ownsProductUi),
    ...productUiSourceViolations(source, label, ownsProductUi),
    ...nestedCardViolations(source, label, ownsProductUi),
    ...productControlViolations(source, label, ownsProductUi),
  );
}

violations.push(
  ...websiteContractViolations(root),
  ...textContrastViolations(root),
  ...productContractViolations(root),
  ...landingThemeViolations(root),
);

// Fonts live in the private Cube-27/cube27-fonts repo (some are licensed for
// self-hosting, not redistribution) and reach public/fonts only through
// `pnpm fonts:pull`. Git's index, not the disk, is what gets published.
const trackedFiles = execFileSync('git', ['-C', root, 'ls-files', '--', ':(top)'], {
  encoding: 'utf8',
}).split('\n');
for (const path of trackedFiles) {
  if (/\.(?:woff2?|ttf|otf)$/i.test(path)) {
    violations.push(`${path}: font files come from the private font repo, never git`);
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('CiteLadder design-system policy passed.');
