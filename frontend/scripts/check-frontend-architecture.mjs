/**
 * Frontend architecture guard (F1 → F2).
 *
 * Enforces line budgets and required-file ownership. The per-domain API owner
 * modules now exist (F2), so the required-owners check is ENFORCED (hard fail)
 * rather than warned. Also enforces that the `index.ts` compat facade owns no
 * transport — it may only spread the per-domain modules, never call `fetch` or
 * import the transport client.
 *
 * Run: node scripts/check-frontend-architecture.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

// Line budgets — split any owner that exceeds its limit.
const lineBudgets = [
  { file: 'app/layout.tsx', maxLines: 120 },
  // globals.css is the single token source — the v2 redesign (Figma token
  // port, plan Task P1) adds the primitive --blue-*/--neutral-* ramps, the
  // Figma --chart-1..8 palette, --score-*-text/-ring/-border, --shadow-1..4,
  // and the authored soft-charcoal dark set on top of the existing semantic
  // tokens (marketing tokens stay out — they live in
  // app/(marketing)/marketing.css), so the budget is raised to 1000.
  { file: 'app/globals.css', maxLines: 1000 },
  { file: 'components/ui/theme-toggle.tsx', maxLines: 120 },
  { file: 'lib/theme.ts', maxLines: 160 },
  // F5 app shell: composition only — split any sub-piece that outgrows this.
  { file: 'components/layout/app-shell.tsx', maxLines: 100 },
  { file: 'app/(app)/layout.tsx', maxLines: 100 },
];

// Per-domain API owners under lib/api/. These now exist (F2), so the check is
// enforced as a hard failure. ENFORCE_API_OWNERS=0 can soften it for debugging.
const requiredApiOwners = [
  'analytics.ts',
  'auth.ts',
  'content.ts',
  'integrations.ts',
  'projects.ts',
  'prompts.ts',
  'providers.ts',
  'runs.ts',
  'traffic.ts',
  'visibility.ts',
];
const ENFORCE_API_OWNERS = process.env.ENFORCE_API_OWNERS !== '0';

const failures = [];
const warnings = [];

function read(relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${relativePath} could not be read: ${message}`);
    return null;
  }
}

for (const check of lineBudgets) {
  const content = read(check.file);
  if (content === null) continue;
  const lines = content.split(/\r?\n/).length;
  if (lines > check.maxLines) {
    failures.push(`${check.file} has ${lines} lines; limit is ${check.maxLines}. Split the owner.`);
  }
}

for (const owner of requiredApiOwners) {
  const ownerPath = path.join(root, 'lib', 'api', owner);
  if (fs.existsSync(ownerPath)) continue;
  const msg = `lib/api/${owner} is missing (API methods split by domain owner).`;
  if (ENFORCE_API_OWNERS) failures.push(msg);
  else warnings.push(msg);
}

// The index.ts compat facade must own no transport: no fetch, no client import.
const indexPath = path.join(root, 'lib', 'api', 'index.ts');
if (fs.existsSync(indexPath)) {
  const indexSource = fs.readFileSync(indexPath, 'utf8');
  if (/\bfetch\s*\(/.test(indexSource)) {
    failures.push('lib/api/index.ts calls fetch() — the facade must own no transport.');
  }
  if (/from\s+['"]\.\/client['"]/.test(indexSource)) {
    failures.push("lib/api/index.ts imports './client' — the facade must own no transport.");
  }
} else if (ENFORCE_API_OWNERS) {
  failures.push('lib/api/index.ts is missing (compat facade spreading the domain modules).');
}

for (const w of warnings) console.warn(`warning: ${w}`);

if (failures.length) {
  console.error('Frontend architecture check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('frontend architecture guard: OK');
