/**
 * Website scale guard — the mechanism that keeps the public surface
 * token-driven (docs/website-design-system.md §3, §4).
 *
 * The debt this exists to prevent: before the token rebuild the marketing
 * surface used 44 distinct spacing values off Tailwind's 4px grid and 8
 * different radius names, none of them from the design system. That is what
 * makes a page look subtly "off" — every section paying its own rent.
 *
 * What it bans, all cheap class-list checks:
 *   1. spacing utilities off the 11-value ladder (p/px/py/gap/mt/mb/space-y…)
 *   2. radius utilities off the 4-rung shape scale
 *   3. arbitrary bracket values in spacing/radius/shadow positions
 *
 * What it deliberately allows:
 *   · `ch`-based max-widths (max-w-[65ch]) — a reading measure is typography,
 *     not spacing, and the spec caps prose at ~60–70 characters
 *   · fractional/percentage widths and viewport units — layout, not spacing
 *   · anything inside the theme files, which own the values
 *
 * Run: node scripts/check-mkt-scale.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const DIRS = ['components/marketing', 'app/(marketing)'];

/**
 * The spacing ladder — the only values the surface may use. 80 and 120 are the
 * mobile/tablet rungs of the responsive section rhythm (200 → 120 → 80), which
 * is section padding and so belongs on the ladder rather than in a bracket.
 */
const SPACING = new Set([
  '6',
  '10',
  '14',
  '20',
  '30',
  '40',
  '50',
  '70',
  '80',
  '100',
  '120',
  '194',
  '200',
]);
/** The shape scale — four rungs plus `full`, which is the pill. */
const RADIUS = new Set(['mkt-pill', 'mkt-xl', 'mkt-lg', 'mkt-sm', 'full', 'none']);

/**
 * Spacing-bearing utility prefixes, LONGEST FIRST — regex alternation is
 * first-match-wins, so `gap` ahead of `gap-x` would parse `gap-x-mkt-30` as
 * `gap` with a rung of `x-mkt-30` and report a false violation.
 */
const SPACE_PREFIX =
  '(?:space-x|space-y|gap-x|gap-y|px|py|pt|pb|pl|pr|ps|pe|mx|my|mt|mb|ml|mr|ms|me|gap|p|m)';

/**
 * Named spacing tokens that are not ladder numbers: the gutter rungs and the
 * fixed nav height. They ARE tokens, which is the point.
 */
const NAMED_SPACING = new Set(['gutter', 'gutter-tablet', 'gutter-phone', 'nav']);

const spaceRe = new RegExp(
  `(?:^|[\\s'"\`])-?(?:[a-z]+:)*${SPACE_PREFIX}-(?:mkt-)?([a-z0-9.-]+)(?=[\\s'"\`]|$)`,
  'g',
);
/**
 * The directional suffix is optional and must not eat the rung name, so it only
 * matches when followed by another `-` segment (rounded-t-mkt-lg), never when
 * the "suffix" is the start of the rung itself (rounded-mkt-lg).
 *
 * A bare `rounded` is only a violation inside a class string. `rounded` is also
 * a perfectly good prop name (WallpaperPanel takes one), and a guard that
 * cannot tell a prop from a utility forces the codebase to rename its props —
 * so the bare form requires a neighbouring class-like token to count.
 */
const radiusRe =
  /(?:^|[\s'"`])(?:[a-z]+:)*rounded(?:-[trbles]{1,2}(?=-))?-((?:mkt-)?[a-z0-9-]*)(?=[\s'"`]|$)/g;
/**
 * String literals, so a bare `rounded` can be judged as a CLASS rather than as
 * a prop name. `rounded` is a perfectly good prop (WallpaperPanel takes one),
 * and a guard that cannot tell the two apart forces the codebase to rename its
 * props — so the bare form only counts inside a quoted class list.
 */
const STRING_LITERAL = /'([^']*)'|"([^"]*)"|`([^`]*)`/g;
/** Arbitrary values in a spacing/radius/shadow slot. */
const arbitraryRe = new RegExp(
  `(?:^|[\\s'"\`])(?:${SPACE_PREFIX}|rounded(?:-[trbles]{1,2})?|shadow)-\\[([^\\]]+)\\]`,
  'g',
);

/**
 * The only arbitrary values allowed in a spacing/radius/shadow slot.
 *
 * Deliberately NARROW. `rem`, bare `calc(…)` and bare `var(…)` were allowed
 * here at first and they re-opened the exact hole this guard closes: any
 * off-ladder pixel can be written as a rem, and `calc()` can wrap anything at
 * all. What survives is the set that is genuinely NOT a spacing decision:
 *
 *   · viewport and container-relative units (%, dvh, vh, vw, fr) — layout
 *   · `1lh`, the current line box — optical alignment of an inline glyph
 *   · `var(--spacing-mkt-…)` / `var(--radius-mkt-…)`, which ARE the ladder,
 *     for the few places a utility cannot reach (arbitrary variants, calc
 *     inside a grid template)
 *
 * A reading measure (`max-w-[65ch]`) is typography, not spacing, and never
 * reaches here: `max-w` is not in SPACE_PREFIX.
 */
const ALLOWED_ARBITRARY =
  /^(?:\d+(?:\.\d+)?(?:%|dvh|vh|vw|fr|lh)|var\(--(?:spacing|radius)-mkt-[a-z0-9-]+\))$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

const failures = [];

/** Spacing utilities must land on the ladder. */
function checkSpacing(line, at) {
  for (const m of line.matchAll(spaceRe)) {
    const value = m[1];
    // `px` is Tailwind's 1px rung and `auto`/`0` are structural.
    if (value === 'auto' || value === '0' || value === 'px') continue;
    if (NAMED_SPACING.has(value)) continue;
    if (!SPACING.has(value)) {
      failures.push(
        `${at} uses spacing "${m[0].trim()}" off the ladder; use a mkt spacing rung (${[...SPACING].join('/')}).`,
      );
    }
  }
}

/** Radius utilities must land on one of the four rungs (or the pill). */
function checkRadius(line, at) {
  for (const m of line.matchAll(radiusRe)) {
    const value = m[1];
    if (value.startsWith('[')) continue; // handled by checkArbitrary
    if (!RADIUS.has(value)) {
      failures.push(
        `${at} uses "rounded-${value}" off the shape scale; use rounded-mkt-pill/xl/lg/sm or rounded-full.`,
      );
    }
  }
  // A bare `rounded` counts only as a class inside a string literal.
  for (const m of line.matchAll(STRING_LITERAL)) {
    const contents = m[1] ?? m[2] ?? m[3] ?? '';
    if (contents.split(/\s+/).some((cls) => cls.replace(/^[a-z0-9]+:/, '') === 'rounded')) {
      failures.push(`${at} uses a bare "rounded"; use rounded-mkt-pill/xl/lg/sm or rounded-full.`);
    }
  }
}

/** Bracket values in a spacing/radius/shadow slot, minus the allowed forms. */
function checkArbitrary(line, at) {
  for (const m of line.matchAll(arbitraryRe)) {
    if (!ALLOWED_ARBITRARY.test(m[1])) {
      failures.push(`${at} sets an arbitrary "${m[0].trim()}"; use a token.`);
    }
  }
}

for (const dir of DIRS) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      checkSpacing(line, at);
      checkRadius(line, at);
      checkArbitrary(line, at);
    });
  }
}

/**
 * Every `--text-mkt-*` rung must be registered with tailwind-merge in
 * lib/utils.ts. This is not a tidiness check: tailwind-merge classifies an
 * unrecognised `text-*` class as a COLOUR, so an unregistered size lands in the
 * same conflict group as `text-mkt-ink` and is silently DELETED wherever the
 * two appear together. That failure is invisible in review — the class is right
 * there in the source — and it is how every subpage headline once rendered at
 * the 14px fallback instead of its rung.
 */
const themeCss = fs.readFileSync(
  path.join(root, 'app', '(marketing)', 'marketing-theme.css'),
  'utf8',
);
const utilsTs = fs.readFileSync(path.join(root, 'lib', 'utils.ts'), 'utf8');
const rungs = new Set(
  [...themeCss.matchAll(/--text-(mkt-[a-z0-9-]+?):/g)]
    .map((m) => m[1])
    // `--text-mkt-h1--line-height` and friends are MODIFIERS of a rung, not
    // rungs; they are the only names carrying a `--` separator.
    .filter((name) => !name.includes('--')),
);
for (const rung of rungs) {
  if (!new RegExp(`'${rung}'`).test(utilsTs)) {
    failures.push(
      `lib/utils.ts does not register "${rung}" with tailwind-merge; the size will be dropped wherever a text colour sits beside it.`,
    );
  }
}

if (failures.length) {
  console.error(`Website scale guard failed (${failures.length}):`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log('website scale guard: OK');
