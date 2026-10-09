import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { ratchetVerdict, readBaseline, writeBaseline } from './design-system-ratchet.mjs';
import { typeDisciplineFindings } from './type-discipline-checks.mjs';

/**
 * The type-discipline ratchet over browser, package and API service source.
 * `--write-baseline` records the current counts; run it after paying debt down.
 */

const root = resolve(import.meta.dirname, '..');
const baselinePath = join(root, 'scripts', 'type-discipline-baseline.json');
const scanned = ['apps', 'components', 'lib', 'packages', 'services'];
const ignored = new Set(['node_modules', 'build', 'dist', 'coverage', 'generated', 'test', 'e2e']);

function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const findings = scanned
  .flatMap((directory) => files(join(root, directory)))
  .filter((path) => /\.tsx?$/.test(path) && !/\.(?:test|spec)\.tsx?$|\.d\.ts$/.test(path))
  .flatMap((path) =>
    typeDisciplineFindings(readFileSync(path, 'utf8'), relative(root, path).replaceAll('\\', '/')),
  );

if (process.argv.includes('--write-baseline')) {
  writeBaseline(baselinePath, findings);
  console.log(`Wrote ${relative(root, baselinePath)} (${findings.length} findings).`);
}
const verdict = ratchetVerdict(
  findings,
  existsSync(baselinePath) ? readBaseline(baselinePath) : { files: {} },
);
if (verdict.lowered.length) {
  console.warn(
    [
      ...verdict.lowered,
      'Debt fell: run node scripts/check-type-discipline.mjs --write-baseline to lower the baseline.',
    ].join('\n'),
  );
}
if (verdict.violations.length) {
  console.error(verdict.violations.join('\n'));
  process.exit(1);
}
console.log('Type-discipline policy passed.');
