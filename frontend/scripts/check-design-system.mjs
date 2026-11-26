import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

import { loadDesignSystem, undeclaredColourViolations } from './design-system-colour-tokens.mjs';
import { TOKEN_FILES, textContrast } from './design-system-contrast.mjs';
import {
  ancestorRuleFindings,
  compositionFindings,
  compositionReport,
  COMPOSITION_ENFORCED,
} from './design-system-composition.mjs';
import {
  appSourceViolations,
  directRadixImportViolations,
  literalColourViolations,
} from './design-system-source-checks.mjs';

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
const RAW_HEX = /(?<![\w-])#[0-9a-f]{3,8}(?![\w-])/i;
const violations = [];
const scriptSources = [];
const composition = [];

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

for (const path of files(root)) {
  const extension = extname(path);
  if (!sourceExtensions.has(extension) || tokenOwners.includes(path)) continue;
  const source = readFileSync(path, 'utf8');
  const label = relative(root, path);
  const styled =
    extension === '.astro'
      ? [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join()
      : source;
  if (RAW_HEX.test(styled))
    violations.push(`${label}: raw colour outside ${TOKEN_FILES.join(' and ')}`);
  if (extension === '.astro') continue;
  if (/\.tsx?$/.test(label) && !/\.test\.tsx?$/.test(label)) scriptSources.push({ label, source });
  composition.push(...compositionFindings(label, source));
  violations.push(
    ...literalColourViolations(source, label),
    ...directRadixImportViolations(source, label),
  );
}

const appCssPath = join(root, 'apps', 'app', 'src', 'app.css');
const appCss = readFileSync(appCssPath, 'utf8');
const designSystem = await loadDesignSystem(appCss, dirname(appCssPath));
const siteCssPath = join(root, 'apps', 'marketing', 'src', 'marketing.css');
const siteDesignSystem = await loadDesignSystem(
  readFileSync(siteCssPath, 'utf8'),
  dirname(siteCssPath),
);
const SITE_SOURCE = /^(?:apps\/(?:marketing|docs)|components\/(?:marketing|content))\//;
const tsxSources = scriptSources.filter(({ label }) =>
  /^(?:apps|components|lib)\/.+\.tsx$/.test(label),
);

const contrast = textContrast(root);
violations.push(
  ...contrast.violations,
  ...undeclaredColourViolations(
    tsxSources.filter(({ label }) => !SITE_SOURCE.test(label)),
    designSystem,
  ),
  ...undeclaredColourViolations(
    tsxSources.filter(({ label }) => SITE_SOURCE.test(label)),
    siteDesignSystem,
  ),
  ...appSourceViolations(appCss, scriptSources),
);

composition.push(
  ...tokenOwners.flatMap((owner) =>
    ancestorRuleFindings(relative(root, owner), readFileSync(owner, 'utf8')),
  ),
);
if (composition.length) {
  const report = compositionReport(composition);
  if (COMPOSITION_ENFORCED) violations.push(report, ...composition);
  else console.warn(`${report}\n(warning only, AR-25; rules in docs/design.md#composition)`);
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('CiteLadder design-system policy passed.');
