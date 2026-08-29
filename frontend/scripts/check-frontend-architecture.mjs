import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const budgets = [
  ['app/layout.tsx', 120],
  // Raised from 560 for the shared a11y primitives (skip link, anchor
  // scroll-margin, safe-area helpers, touch-action), then from 620 for the
  // `brand-canvas-*` roles and `border-bold` — the split auth/onboarding
  // surface is the one part of the app that is dark in every theme, and the
  // alternative was the raw palette classes it replaced. Token/recipe sprawl is
  // still what this budget guards.
  ['app/globals.css', 640],
  ['components/layout/app-shell.tsx', 150],
  ['app/(app)/layout.tsx', 100],
];

for (const [file, limit] of budgets) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    failures.push(`${file} is missing.`);
    continue;
  }
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/).length;
  if (lines > limit) failures.push(`${file} has ${lines} lines; limit is ${limit}.`);
}

for (const owner of [
  'ai-referrals.ts',
  'auth.ts',
  'content.ts',
  'integrations.ts',
  'opportunities.ts',
  'projects.ts',
  'prompts.ts',
  'providers.ts',
  'runs.ts',
  'traffic.ts',
  'visibility.ts',
]) {
  if (!fs.existsSync(path.join(root, 'lib', 'api', owner))) {
    failures.push(`lib/api/${owner} is missing.`);
  }
}

// Hard navigation is a two-module seam. The linter used to carry a related
// guard -- `@next/next/no-location-assign-relative-destination` -- which oxlint
// does not implement; this is the stricter replacement, because it also keeps
// untestable direct calls out of components (see the header comments on both
// owners for why the seam exists at all).
const NAVIGATION_OWNERS = new Set(['lib/navigate.ts', 'lib/navigation/hard-navigate.ts']);
const HARD_NAVIGATION = /location\s*\.\s*(?:assign|replace)\s*\(|location\s*\.\s*href\s*=[^=]/;

function sourceFiles(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

for (const file of ['app', 'components', 'lib'].flatMap(sourceFiles)) {
  if (NAVIGATION_OWNERS.has(file) || file.includes('.test.')) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  // Strip comments so the seam's own prose references do not trip the guard.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  if (HARD_NAVIGATION.test(code)) {
    failures.push(`${file} navigates the browser directly; use lib/navigation/hard-navigate.ts.`);
  }
}

const facade = path.join(root, 'lib', 'api', 'index.ts');
if (fs.existsSync(facade)) {
  const source = fs.readFileSync(facade, 'utf8');
  if (/\bfetch\s*\(/.test(source) || /from\s+['"]\.\/client['"]/.test(source)) {
    failures.push('lib/api/index.ts must not own transport.');
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Frontend architecture guard passed.');
