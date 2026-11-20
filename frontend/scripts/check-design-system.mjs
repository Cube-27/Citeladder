import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import {
  appSourceViolations,
  directRadixImportViolations,
  productControlViolations,
  productUiSourceViolations,
  textContrastViolations,
  textRoleBackgroundViolations,
} from './design-system-source-checks.mjs';
import { appVocabularyViolations } from './design-system-app-vocabulary.mjs';
import { websiteOnlyImportViolations } from './design-system-website-only.mjs';
import {
  landingThemeViolations,
  websiteContractViolations,
  websiteStyleViolations,
} from './design-system-stylesheet-checks.mjs';
import { styleAssertionViolations } from './design-system-test-checks.mjs';
import { tokenAuditViolations } from './audit-design-tokens.mjs';
import { brandTokenViolations, svgColorScan } from './design-system-asset-checks.mjs';
import { resolvePalette } from './design-system-contrast.mjs';
import { cssPolicyScan } from './design-system-css-checks.mjs';
import { ratchetVerdict, readBaseline, writeBaseline } from './design-system-ratchet.mjs';
import { typeDisciplineFindings } from './type-discipline-checks.mjs';

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
const baselinePath = join(root, 'scripts', 'design-system-baseline.json');
const typeBaselinePath = join(root, 'scripts', 'type-discipline-baseline.json');
const violations = [];
const advisories = [];
// Ratcheted findings: counted per file and rule against the baseline.
const findings = [];
// Type-discipline findings, ratcheted against their own baseline. They read
// the same parsed module, so they ride this walk rather than a second one.
const typeFindings = [];
const typeSource = (label) =>
  /^(?:apps|components|lib|packages|services)\//.test(label) &&
  /\.tsx?$/.test(label) &&
  !/\.(?:test|spec)\.tsx?$|\.d\.ts$/.test(label) &&
  !/\/(?:test|e2e|generated)\//.test(label);
// Script sources, for the app's Tailwind @source coverage.
const scriptSources = [];

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const tokenCss = readFileSync(tokenOwner, 'utf8');

for (const path of files(root)) {
  const extension = extname(path);
  if (!sourceExtensions.has(extension) && extension !== '.astro') continue;
  const source = readFileSync(path, 'utf8');
  const label = relative(root, path);
  if (extension === '.astro') {
    // An Astro component's `<style>` blocks answer to the stylesheet rules.
    const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
      .map((match) => match[1])
      .join('\n');
    if (/(?<![\w-])#[0-9a-f]{3,8}(?![\w-])/i.test(styles))
      violations.push(`${label}: raw color outside apps/app/src/globals.css`);
    if (/^(?:apps\/marketing|components\/marketing)\//.test(label))
      violations.push(...websiteStyleViolations(styles, label));
    continue;
  }
  if (/\.tsx?$/.test(label) && !/\.test\.tsx?$/.test(label)) scriptSources.push({ label, source });
  if (
    path !== tokenOwner &&
    path !== import.meta.filename &&
    /(?<![\w-])#[0-9a-f]{3,8}(?![\w-])/i.test(source)
  ) {
    violations.push(`${label}: raw color outside apps/app/src/globals.css`);
  }
  if (
    path !== tokenOwner &&
    path !== import.meta.filename &&
    /@theme\b(?:\s+(?:inline|static|reference|default))*\s*\{/.test(source)
  ) {
    violations.push(`${label}: @theme outside apps/app/src/globals.css`);
  }
  violations.push(
    ...directRadixImportViolations(source, label),
    ...styleAssertionViolations(source, label),
  );
  // Sign-in and onboarding are product UI: they compose the Flow and Setup
  // templates (components/templates/flow-page.tsx, setup-page.tsx).
  const ownsProductUi =
    !label.includes('.test.') &&
    !label.startsWith('components/marketing/') &&
    !label.startsWith('lib/marketing-content/') &&
    (label.startsWith('apps/app/src/') ||
      label.startsWith('components/') ||
      label.startsWith('lib/'));
  // Applies to every source file, not just product UI: a text-ink background
  // is wrong on a marketing surface too.
  violations.push(
    ...textRoleBackgroundViolations(source, label),
    ...productUiSourceViolations(source, label, ownsProductUi),
    ...productControlViolations(source, label, ownsProductUi),
    ...appVocabularyViolations(source, label, ownsProductUi),
    ...websiteOnlyImportViolations(source, label, ownsProductUi),
  );
  if (typeSource(label)) typeFindings.push(...typeDisciplineFindings(source, label));
}

const lightPalette = resolvePalette(tokenCss, ':root');
findings.push(...cssPolicyScan(root), ...svgColorScan(root, lightPalette));
for (const [path, ratcheted] of [
  [baselinePath, findings],
  [typeBaselinePath, typeFindings],
]) {
  if (process.argv.includes('--write-baseline')) {
    writeBaseline(path, ratcheted);
    console.log(`Wrote ${relative(root, path)} (${ratcheted.length} findings).`);
  }
  const ratchet = ratchetVerdict(ratcheted, existsSync(path) ? readBaseline(path) : { files: {} });
  violations.push(...ratchet.violations);
  if (ratchet.lowered.length) {
    advisories.push(
      ...ratchet.lowered,
      'Debt fell: run node scripts/check-design-system.mjs --write-baseline to lower the baseline.',
    );
  }
}

violations.push(
  ...brandTokenViolations(lightPalette),
  ...tokenAuditViolations(root),
  ...websiteContractViolations(root),
  ...textContrastViolations(root),
  ...landingThemeViolations(root),
  ...appSourceViolations(
    readFileSync(join(root, 'apps', 'app', 'src', 'app.css'), 'utf8'),
    scriptSources,
  ),
);

// Fonts live in the private Cube-27/cube27-fonts repo (some are licensed for
// self-hosting, not redistribution) and reach public/fonts only through
// `pnpm fonts:pull`. Git's index, not the disk, is what gets published.
// An absolute path, not PATH lookup: a PATH entry cannot substitute git (Sonar S4036).
const GIT_EXECUTABLE = '/usr/bin/git';
const trackedFiles = execFileSync(GIT_EXECUTABLE, ['-C', root, 'ls-files', '--', ':(top)'], {
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
if (advisories.length) console.warn(advisories.join('\n'));
console.log('CiteLadder design-system policy passed.');
