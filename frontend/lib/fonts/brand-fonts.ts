/**
 * The brand faces' CSS, written once from `lib/config/brand-fonts.json` for
 * every runtime that loads them (the app's index.html through its Vite build,
 * the website and docs through `PublicFonts.astro`).
 *
 * Changing a face is an edit to that JSON (`family` and `file`) followed by
 * `pnpm fonts:pull`, which copies the files from the private font repository
 * and recomputes the weight range and fallback metrics stored beside them.
 * Nothing else names a face.
 */
import config from '../config/brand-fonts.json';

type FontRole = 'text' | 'heading' | 'figure';
type FontSurface = 'app' | 'public';
type Face = (typeof config.faces)[FontRole];

/**
 * The figure face sets numbers only: digits and the marks inside a number
 * (. , : % + - −). Letters and spaces fall through to the text face, so a
 * figure's unit or a "Not measured" stays in the text face and the line box
 * keeps the text face's metrics. Billing PDFs use the same characters.
 */
const FIGURE_UNICODE_RANGE = 'U+0025, U+002B-002E, U+0030-003A, U+2212';

const ROLES: readonly FontRole[] = ['text', 'heading', 'figure'];

/** The hosted face's family name for a role, as `document.fonts` reports it. */
export function brandFontName(role: FontRole): string {
  return `${config.faces[role].family} Variable`;
}

/** The hosted files a surface preloads, so the faces are found at first paint. */
function brandFontPreloads(surface: FontSurface): string[] {
  return ROLES.filter((role) => config.faces[role].preload.includes(surface)).map(
    (role) => `/fonts/${config.faces[role].file}`,
  );
}

function rangeLine(role: FontRole): string {
  return role === 'figure' ? `\n  unicode-range: ${FIGURE_UNICODE_RANGE};` : '';
}

/*
 * `font-display: fallback`: a ~100ms block period, then a ~3s window in which
 * the face may still swap in, then a permanent commit to the fallback. Not
 * `optional`, which commits after the block period alone (a hard reload then
 * never shows the face), and not `swap`, whose unbounded swap re-lays out the
 * page whenever a slow face lands.
 *
 * 500 is the ceiling for every face: a heavier request clamps to it, and
 * `font-synthesis-weight: none` stops a faux bold on top.
 */
function hostedFace(role: FontRole, face: Face): string {
  return `@font-face {
  font-family: '${face.family} Variable';
  src: url('/fonts/${face.file}') format('woff2');
  font-weight: ${face.weights};
  font-style: normal;
  font-display: fallback;${rangeLine(role)}
}`;
}

/** Arial scaled to the face's x-height (the figure face: its digit advance) and line metrics. */
function fallbackFace(role: FontRole, face: Face): string {
  const metrics = face.fallback;
  return `@font-face {
  font-family: '${face.family} Fallback';
  src: local('Arial');
  font-weight: 100 500;
  size-adjust: ${metrics.sizeAdjust};
  ascent-override: ${metrics.ascentOverride};
  descent-override: ${metrics.descentOverride};
  line-gap-override: ${metrics.lineGapOverride};${rangeLine(role)}
}`;
}

/** Every face, its fallback, and the `--font-*` roles the stylesheets read. */
function brandFontCss(): string {
  const { text, heading, figure } = config.faces;
  const faces = ROLES.flatMap((role) => [
    hostedFace(role, config.faces[role]),
    fallbackFace(role, config.faces[role]),
  ]);
  return `${faces.join('\n')}
:root {
  font-synthesis-weight: none;
  --font-text: '${text.family} Variable', '${text.family} Fallback', Arial;
  --font-heading: '${heading.family} Variable', '${heading.family} Fallback', Arial;
  --font-figure: '${figure.family} Variable', '${figure.family} Fallback';
}`;
}

/** The `<link rel="preload">` tags and `<style>` block a surface's `<head>` carries. */
export function brandFontHead(surface: FontSurface): string {
  const preloads = brandFontPreloads(surface).map(
    (href) =>
      `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin="anonymous" />`,
  );
  return [...preloads, `<style>\n${brandFontCss()}\n</style>`].join('\n');
}
