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
  // The Atlassian primitive layer: --ds-* values ported verbatim from
  // @atlaskit/tokens, light + dark. Values only — it declares no semantics and
  // nothing consumes it directly. Growth here should mean "we started using
  // another ADS token", which is cheap and legitimate; what it may not hold is
  // a semantic name or a component rule.
  { file: 'app/ds-tokens.css', maxLines: 400 },
  // globals.css owns the COLOUR semantic layer that maps onto ds-tokens.css
  // (plus the @theme colour bridge and the element base). The budget dropped
  // from 1020 to 900 with the ADS port, and 900 → 700 with the file split
  // that gave the type ladder (ds-type.css), the spacing/density/radii
  // ladder (ds-space.css) and the chrome rules (app-chrome.css) their own
  // owners. Do not raise this to accommodate restated dark values — if a
  // token needs a dark override here, that is a signal the primitive layer
  // is missing one.
  { file: 'app/globals.css', maxLines: 700 },
  // The type layer: the --text-* ladder with baked line-height/weight, the
  // four weights and the leading overrides — both the @theme inline bridge
  // half and the :root semantic half.
  { file: 'app/ds-type.css', maxLines: 200 },
  // The space layer: the ADS spacing ladder, density tokens (card, gutter,
  // table, controls), shell geometry and radii. Both halves.
  { file: 'app/ds-space.css', maxLines: 160 },
  // Chrome rules: focus rings, ::selection, the logo mark, scrollbars, the
  // reduced-motion / forced-colors / print fallbacks. No tokens.
  { file: 'app/app-chrome.css', maxLines: 260 },
  // The marketing/auth "Proof" system. This budget is the whole point of the
  // rewrite: the previous marketing stylesheet reached 6,846 lines of global
  // cascade because nothing stopped it growing. Sections here are built from
  // mkt-namespaced Tailwind utilities, and this file holds only the @theme
  // token block plus the few scene rules a utility cannot express. If a new
  // section needs CSS here, it needs a primitive in
  // components/marketing/primitives/ instead — do not raise this number.
  { file: 'app/(marketing)/marketing-theme.css', maxLines: 400 },
  // Marketing motion — split out of -theme.css when the scroll-reveal work
  // pushed it over budget. Same principle: keyframes and scroll timelines are
  // a separate concern from tokens, so they get an owner rather than a raised
  // ceiling. Motion here is always additive over already-rendered content —
  // nothing that content needs in order to become visible belongs in it.
  //
  // Unlike marketing-theme.css this ceiling MAY rise, because this file exists
  // to hold motion and each new kind of motion legitimately costs lines (260 →
  // 300 for the hero marquee). What it may not hold is anything that is not
  // motion. If it starts accumulating layout or colour, split it instead.
  // (ADS Phase A considered 300 → 320 and left it: that phase adds no motion.)
  { file: 'app/(marketing)/marketing-motion.css', maxLines: 300 },
  // The double-ring CTA. Split from -theme.css on the same principle as
  // -motion.css: that file's header forbids raising its budget to absorb a
  // component rule, and this is one. It owns ONE construction — the shell,
  // the clipped pill, the two trading badges and their variants. A second
  // unrelated component rule does not belong here; it needs its own owner or,
  // better, a primitive in components/marketing/primitives/.
  { file: 'app/(marketing)/marketing-cta.css', maxLines: 215 },
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

// ── Marketing type ladder ─────────────────────────────────────────────────
// Marketing headings must sit on a `text-mkt-*` rung, and the rung must be the
// whole decision: every step in marketing-theme.css carries its own font-weight,
// so a `font-medium`/`font-semibold` beside it is drift waiting to happen (this
// is exactly how the surface ended up with three different card-heading sizes).
// Two bans, both cheap to check on the class list:
//   1. raw Tailwind size utilities (text-lg, text-3xl, text-[28px]) in marketing
//   2. a weight utility on the same element as a display rung
const MKT_GLOBS = ['components/marketing', 'app/(marketing)'];
const MKT_RUNGS = /\btext-mkt-(?:d[1-5]|figure)\b/;
const RAW_SIZE =
  /(?:^|[\s'"`])(?:sm:|md:|lg:|xl:)?text-(?:xs|sm|base|lg|[2-9]xl|\[[^\]]+\])(?=[\s'"`]|$)/;
const WEIGHT = /\bfont-(?:medium|semibold|bold)\b/;
/** App-side type names that must not leak onto the marketing surface. */
const APP_TYPE_LEAK = /\btext-heading-(?:sm|md|lg)\b/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

for (const glob of MKT_GLOBS) {
  const dir = path.join(root, glob);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      if (APP_TYPE_LEAK.test(line)) {
        failures.push(`${at} uses an app heading token; marketing headings ride text-mkt-* rungs.`);
      }
      if (RAW_SIZE.test(line)) {
        failures.push(`${at} sets a raw Tailwind text size; use a text-mkt-* rung.`);
      }
      if (MKT_RUNGS.test(line) && WEIGHT.test(line)) {
        failures.push(
          `${at} overrides font-weight on a text-mkt-* rung; the rung owns the weight.`,
        );
      }
    });
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);

if (failures.length) {
  console.error('Frontend architecture check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('frontend architecture guard: OK');
