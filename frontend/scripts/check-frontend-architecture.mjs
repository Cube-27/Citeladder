import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  RATCHETS,
  baselineDiffFailures,
  baselineRatchetFailures,
  loweredBaseline,
  typeDisciplineFindings,
} from './type-discipline-checks.mjs';

const root = process.cwd();
const failures = [];

for (const owner of [
  'ai-traffic.ts',
  'auth.ts',
  'integrations.ts',
  'opportunities.ts',
  'performance.ts',
  'projects.ts',
  'prompts.ts',
  'providers.ts',
  'runs.ts',
  'visibility.ts',
]) {
  if (!fs.existsSync(path.join(root, 'lib', 'api', owner))) {
    failures.push(`lib/api/${owner} is missing.`);
  }
}

const NAVIGATION_OWNERS = new Set(['lib/navigation/hard-navigate.ts']);
const HARD_NAVIGATION = /location\s*\.\s*(?:assign|replace)\s*\(|location\s*\.\s*href\s*=[^=]/;

function sourceFiles(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', 'build'].includes(entry.name)) return [];
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

for (const file of ['app', 'components', 'lib'].flatMap(sourceFiles)) {
  if (NAVIGATION_OWNERS.has(file) || file.includes('.test.')) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  if (HARD_NAVIGATION.test(code)) {
    failures.push(`${file} navigates the browser directly; use lib/navigation/hard-navigate.ts.`);
  }
}

for (const file of sourceFiles('lib/api')) {
  if (file.includes('.test.')) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (/\bz\s*\.\s*(?:object|strictObject|looseObject)\s*\(/.test(source)) {
    failures.push(`${file} declares an API object schema outside packages/contracts.`);
  }
}

const facade = path.join(root, 'lib', 'api', 'index.ts');
if (fs.existsSync(facade)) {
  const source = fs.readFileSync(facade, 'utf8');
  if (/\bfetch\s*\(/.test(source) || /from\s+['"]\.\/client['"]/.test(source)) {
    failures.push('lib/api/index.ts must not own transport.');
  }
}

const ratchetCounts = RATCHETS.map(() => ({}));
for (const file of ['apps', 'components', 'lib', 'packages', 'services'].flatMap(sourceFiles)) {
  if (/\.(?:test|spec)\.tsx?$|\.d\.ts$|\/(?:test|e2e|generated)\//.test(file)) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const { line, message } of typeDisciplineFindings(source, file))
    failures.push(`${file}:${line}: ${message}`);
  RATCHETS.forEach((ratchet, index) => {
    const count = ratchet.count(source, file);
    if (count) ratchetCounts[index][file] = count;
  });
}
RATCHETS.forEach((ratchet, index) =>
  failures.push(...ratchetFailures(ratchet, ratchetCounts[index])),
);

function baselineAtBase(ratchet) {
  const base = process.env.COMPLEXITY_BASE_SHA;
  if (!base || /^0+$/.test(base)) return null;
  if (!/^[0-9a-f]{40}$/i.test(base)) throw new Error(`invalid COMPLEXITY_BASE_SHA: ${base}`);
  try {
    return JSON.parse(
      execFileSync(
        '/usr/bin/git',
        ['-C', root, 'show', `${base}:frontend/scripts/${ratchet.file}`],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    );
  } catch (error) {
    if (/does not exist in|exists on disk, but not in/.test(String(error?.stderr))) return null;
    throw error;
  }
}

function ratchetFailures(ratchet, counts) {
  const target = path.join(root, 'scripts', ratchet.file);
  let baseline = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (process.argv.includes(ratchet.flag)) {
    baseline = loweredBaseline(counts, baseline);
    fs.writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`);
  }
  const base = baselineAtBase(ratchet);
  return [
    ...baselineRatchetFailures({ counts, baseline, ratchet }),
    ...(base ? baselineDiffFailures({ base, baseline, ratchet }) : []),
  ];
}

const tracked = execFileSync('/usr/bin/git', ['-C', root, 'ls-files', '--', ':(top)'], {
  encoding: 'utf8',
}).split('\n');
for (const file of tracked.filter((name) => /\.(?:woff2?|ttf|otf)$/i.test(name))) {
  failures.push(`${file}: font files come from the private font repo, never git`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Frontend architecture guard passed.');
