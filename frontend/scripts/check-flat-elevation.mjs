/**
 * Flat 2.0 elevation guard.
 *
 * WHY THIS EXISTS. Every design pass on this app has drifted back to
 * soft-shadow "floating card" UI, because flatness was only ever a
 * preference. The two rules that never drift here — no raw hex, no token
 * escapes — are the ones a script enforces. So this is that script.
 *
 * The policy (docs/design.md, "Flat 2.0"):
 *   1. No shadow on anything in normal document flow. Cards, panels,
 *      tables, sidebars, page headers, stat tiles, inputs, tabs, badges.
 *   2. Shadow ONLY on true overlays — modal, dropdown, popover, tooltip,
 *      toast, command palette — via the single `shadow-modal-value` rung.
 *   3. Depth is a tint step plus a 1px alpha hairline, never light.
 *   4. No gradients or backdrop-blur on UI chrome. Display art that is not
 *      a control or container (the marketing wallpaper SVG, the marquee
 *      mask) lives in CSS, which this component scan does not read.
 *
 * Marketing is inside the policy with no exemption: the `--shadow-mkt-*`
 * family and the glass utilities are gone, the nav's two floating overlays
 * use `shadow-modal-value` like every other overlay, and the wallpaper
 * scenes are opaque panels with hairline borders.
 *
 * Run: node scripts/check-flat-elevation.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SEARCH_ROOTS = ['app', 'components', 'lib'];

/**
 * The only files allowed to apply a shadow utility: the overlay primitives.
 * Adding to this list is a design decision, not a formality — an entry here
 * asserts the surface genuinely floats above the page.
 */
const OVERLAY_ALLOWLIST = new Set([
  'components/ui/dialog.tsx',
  'components/ui/dropdown.tsx',
  'components/ui/tooltip.tsx',
  'components/ui/command-palette.tsx',
  'components/ui/market-select.tsx',
  'components/opportunities/evidence-drawer.tsx',
  // Marketing nav dropdown — the one floating surface on the landing.
  'components/marketing/chrome/nav.tsx',
]);

/** The one sanctioned shadow value. Overlays may use nothing else. */
const ALLOWED_SHADOW_UTILITY = 'shadow-modal-value';

/**
 * Tailwind shadow utilities, including arbitrary values and the ring-shadow
 * family. `shadow-none` is fine — it is an explicit opt-out, not elevation.
 * Guard against matching `shadow-modal-value` itself, and against words that
 * merely contain "shadow" (e.g. a `boxShadow` prop name or a CSS var).
 */
/**
 * Named utilities (`shadow-card`), Tailwind arbitrary values
 * (`shadow-[0_2px_6px_#0003]`), and the v4 custom-property shorthand
 * (`shadow-(--my-shadow)`). All three are ways to put a shadow on a surface, so
 * all three have to be caught — matching only the named form would leave the
 * escape hatches open.
 */
const SHADOW_UTILITY =
  /(?<![\w-])shadow-(?!none\b|modal-value\b)(?:\[[^\]\s]*\]|\((?:--)?[^)\s]*\)|[a-z0-9-]+)/g;
const GRADIENT_UTILITY =
  /(?<![\w-])(?:bg-gradient-to-[a-z]+|bg-linear-|bg-radial-|bg-conic-|backdrop-blur)/g;

/**
 * Blank out comments while preserving line numbers and column offsets, so a
 * doc comment that *names* `shadow-card` is not mistaken for a use of it.
 * Deliberately naive about strings containing `//` — a false negative there is
 * harmless, a false positive on every JSDoc block is not.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (line) => ' '.repeat(line.length));
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    if (!/\.(tsx|ts)$/.test(path)) return [];
    if (/\.(test|spec)\.(tsx|ts)$/.test(path)) return [];
    return [path];
  });
}

const violations = [];

function report(file, line, message) {
  violations.push(`${file}:${line}: ${message}`);
}

for (const root of SEARCH_ROOTS) {
  const rootPath = join(ROOT, root);
  if (!existsSync(rootPath)) continue;

  for (const absolute of walk(rootPath)) {
    const file = relative(ROOT, absolute).replaceAll('\\', '/');
    const isOverlay = OVERLAY_ALLOWLIST.has(file);
    const lines = stripComments(readFileSync(absolute, 'utf8')).split(/\r?\n/);

    lines.forEach((text, index) => {
      const lineNumber = index + 1;

      for (const [match] of text.matchAll(SHADOW_UTILITY)) {
        report(
          file,
          lineNumber,
          isOverlay
            ? `overlay uses \`${match}\` — overlays may only use \`${ALLOWED_SHADOW_UTILITY}\``
            : `\`${match}\` on an in-flow surface. Flat 2.0: separate surfaces with a tint step and a 1px hairline. If this genuinely floats, make it an overlay primitive.`,
        );
      }

      for (const [match] of text.matchAll(GRADIENT_UTILITY)) {
        report(
          file,
          lineNumber,
          `\`${match}\` on UI chrome. Gradients and blur are display art only (components/marketing/), never a control or container.`,
        );
      }
    });
  }
}

/**
 * The token layer itself: the in-flow shadow rungs must resolve to `none`.
 * This is the half of the policy a component scan cannot see — if these
 * values come back, every card silently lifts again.
 */
const FLAT_RUNGS = [
  'shadow-xs-value',
  'shadow-sm-value',
  'shadow-card-value',
  'shadow-elevated-value',
];

const globalsPath = join(ROOT, 'app', 'globals.css');
if (!existsSync(globalsPath)) {
  violations.push('app/globals.css is missing — cannot verify the flat elevation rungs.');
} else {
  const css = readFileSync(globalsPath, 'utf8');
  for (const rung of FLAT_RUNGS) {
    const declaration = new RegExp(`--${rung}\\s*:\\s*([^;]+);`).exec(css);
    if (!declaration) {
      violations.push(`app/globals.css: --${rung} is not declared.`);
    } else if (declaration[1].trim() !== 'none') {
      violations.push(
        `app/globals.css: --${rung} is \`${declaration[1].trim()}\`, expected \`none\`. ` +
          'In-flow surfaces are flat; only --shadow-lg-value / --shadow-modal carry a shadow.',
      );
    }
  }
}

if (violations.length) {
  console.error('Flat 2.0 elevation guard failed:');
  for (const v of violations) console.error(`- ${v}`);
  console.error(
    '\nSee docs/design.md "Flat 2.0". Surfaces are flat fills separated by a tint\n' +
      'step and a 1px alpha hairline; shadow means "this floats above the page".',
  );
  process.exit(1);
}

console.log('flat elevation guard: OK');
