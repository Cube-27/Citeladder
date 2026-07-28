/**
 * Elevation guard.
 *
 * WHY THIS EXISTS. Design passes drift: shadows creep onto every surface,
 * or get banned so hard the UI goes flat and lifeless. The two rules that
 * never drift here — no raw hex, no token escapes — are the ones a script
 * enforces, so the elevation policy is a script too.
 *
 * The policy (docs/design.md, "Elevation", §4a) — the ADS surface/shadow
 * pairing, the Gmail/Trello borderless model:
 *   1. Cards rest on the raised rung: `shadow-card` (= --ds-shadow-raised)
 *      and carry NO border — light, not an outline, separates the card.
 *   2. Interactive cards lift on hover: `shadow-card-hover` (the overlay
 *      rung) — the card floats while the pointer is over it.
 *   3. True overlays — modal, dropdown, popover, tooltip, toast, command
 *      palette — use `shadow-modal-value`, and only files on the overlay
 *      allowlist may apply it. Adding an entry is a design decision.
 *   4. Nothing else casts a shadow. No arbitrary shadow values, no
 *      shadow-xs/sm/md/lg/xl utilities, no ring-shadows.
 *   5. No gradients or backdrop-blur on UI chrome. Display art that is not
 *      a control or container (the marketing wallpaper SVG, the marquee
 *      mask) lives in CSS, which this component scan does not read.
 *
 * Run: node scripts/check-elevation.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SEARCH_ROOTS = ['app', 'components', 'lib'];

/**
 * The only files allowed to apply the overlay rung (`shadow-modal-value`).
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

/** The card rungs — the only shadows an in-flow surface may carry. */
const CARD_RUNGS = new Set(['shadow-card', 'shadow-card-hover']);

/** The one sanctioned overlay value. Overlays may use nothing else. */
const ALLOWED_OVERLAY_UTILITY = 'shadow-modal-value';

/**
 * Named utilities (`shadow-card`), Tailwind arbitrary values
 * (`shadow-[0_2px_6px_#0003]`), and the v4 custom-property shorthand
 * (`shadow-(--my-shadow)`). All three put a shadow on a surface, so all
 * three are caught — matching only the named form would leave the escape
 * hatches open. `shadow-none` is fine: an explicit opt-out, not elevation.
 */
const SHADOW_UTILITY = /(?<![\w-])shadow-(?!none\b)(?:\[[^\]\s]*\]|\((?:--)?[^)\s]*\)|[a-z0-9-]+)/g;
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
        if (CARD_RUNGS.has(match)) continue; // the card rungs — allowed anywhere
        if (match === ALLOWED_OVERLAY_UTILITY && isOverlay) continue; // the overlay rung, in its allowlist
        report(
          file,
          lineNumber,
          isOverlay
            ? `overlay uses \`${match}\` — overlays may only use \`${ALLOWED_OVERLAY_UTILITY}\``
            : match === ALLOWED_OVERLAY_UTILITY
              ? `\`${match}\` outside the overlay allowlist. If this surface genuinely floats, adding its file to OVERLAY_ALLOWLIST is a design decision.`
              : `\`${match}\` on an in-flow surface. In-flow surfaces carry the card rungs (\`shadow-card\` / \`shadow-card-hover\`) only; if this genuinely floats, make it an overlay primitive.`,
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
 * The token layer itself: the rung assignments. This is the half of the
 * policy a component scan cannot see — if these values move, every surface
 * silently re-depths itself.
 */
const EXPECTED_RUNGS = {
  // In-flow card rungs.
  'shadow-card-value': 'var(--ds-shadow-raised)',
  'shadow-card-hover-value': 'var(--ds-shadow-overlay)',
  // Deliberately empty — no third in-flow rung may creep back.
  'shadow-xs-value': 'none',
  'shadow-sm-value': 'none',
  'shadow-elevated-value': 'none',
  // The overlay rung.
  'shadow-lg-value': 'var(--ds-shadow-overlay)',
  'shadow-modal': 'var(--ds-shadow-overlay)',
};

const globalsPath = join(ROOT, 'app', 'globals.css');
if (!existsSync(globalsPath)) {
  violations.push('app/globals.css is missing — cannot verify the elevation rungs.');
} else {
  const css = readFileSync(globalsPath, 'utf8');
  for (const [rung, expected] of Object.entries(EXPECTED_RUNGS)) {
    const declaration = new RegExp(`--${rung}\\s*:\\s*([^;]+);`).exec(css);
    if (!declaration) {
      violations.push(`app/globals.css: --${rung} is not declared.`);
    } else if (declaration[1].trim() !== expected) {
      violations.push(
        `app/globals.css: --${rung} is \`${declaration[1].trim()}\`, expected \`${expected}\`. ` +
          'See docs/design.md §4a for the rung assignments.',
      );
    }
  }
}

if (violations.length) {
  console.error('Elevation guard failed:');
  for (const v of violations) console.error(`- ${v}`);
  console.error(
    '\nSee docs/design.md "Elevation" (§4a). Cards rest on the raised rung and carry\n' +
      'no border; overlays float on the overlay rung; nothing else casts a shadow.',
  );
  process.exit(1);
}

console.log('elevation guard: OK');
