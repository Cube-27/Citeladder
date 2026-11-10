/**
 * The brand faces' CSS, written once from `lib/config/brand-fonts.json` for
 * every runtime that loads them (the app's index.html through its Vite build,
 * the website and docs through `PublicFonts.astro`).
 *
 * Three roles, the design system's families: `display` (Cal Sans, weight 400
 * only, the website's and docs' alone: the app sets none, so it never
 * preloads it, and a declared face nothing uses is never fetched), `sans`
 * (Instrument Sans) and `mono` (Geist Mono). Changing a face is an edit to
 * that JSON (`family` and `file`) followed by `pnpm fonts:pull`, which copies
 * the files from the private font repository and recomputes the weight range
 * and fallback metrics stored beside them. Nothing else names a face.
 */
// The attribute is required where Node loads this module itself (Playwright).
import config from '../config/brand-fonts.json' with { type: 'json' };

type FontRole = keyof typeof config.faces;
type FontSurface = 'app' | 'public';
type Face = (typeof config.faces)[FontRole];

const ROLES: readonly FontRole[] = ['display', 'sans', 'mono'];

/** The local face each role's fallback scales: a monospace face for `mono`. */
const FALLBACK_LOCAL: Record<FontRole, string> = {
  display: 'Arial',
  sans: 'Arial',
  mono: 'Courier New',
};

/** The hosted face's family name for a role, as `document.fonts` reports it. */
export function brandFontName(role: FontRole): string {
  return `CiteLadder ${config.faces[role].family}`;
}

/** The hosted files a surface preloads, so the faces are found at first paint. */
function brandFontPreloads(surface: FontSurface): string[] {
  return ROLES.filter((role) => config.faces[role].preload.includes(surface)).map(
    (role) => `/fonts/${config.faces[role].file}`,
  );
}

/*
 * `font-display: fallback`: a ~100ms block period, then a ~3s window in which
 * the face may still swap in, then a permanent commit to the fallback. Not
 * `optional`, which commits after the block period alone (a hard reload then
 * never shows the face), and not `swap`, whose unbounded swap re-lays out the
 * page whenever a slow face lands.
 *
 * Each face declares only the weights it has, and `font-synthesis-weight:
 * none` stops a faux bold on top (Cal Sans is 400 alone).
 */
function hostedFace(role: FontRole, face: Face): string {
  return `@font-face {
  font-family: '${brandFontName(role)}';
  src: url('/fonts/${face.file}') format('woff2');
  font-weight: ${face.weights};
  font-style: normal;
  font-display: fallback;
}`;
}

/** A local face scaled to the hosted face's x-height (mono: its advance) and line metrics. */
function fallbackFace(role: FontRole, face: Face): string {
  const metrics = face.fallback;
  return `@font-face {
  font-family: '${brandFontName(role)} Fallback';
  src: local('${FALLBACK_LOCAL[role]}');
  font-weight: ${face.weights};
  size-adjust: ${metrics.sizeAdjust};
  ascent-override: ${metrics.ascentOverride};
  descent-override: ${metrics.descentOverride};
  line-gap-override: ${metrics.lineGapOverride};
}`;
}

/** Every face, its fallback, and the `--font-face-*` roles globals.css reads. */
function brandFontCss(): string {
  const faces = ROLES.flatMap((role) => [
    hostedFace(role, config.faces[role]),
    fallbackFace(role, config.faces[role]),
  ]);
  const roles = ROLES.map(
    (role) => `  --font-face-${role}: '${brandFontName(role)}', '${brandFontName(role)} Fallback';`,
  );
  return `${faces.join('\n')}
:root {
  font-synthesis-weight: none;
${roles.join('\n')}
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
