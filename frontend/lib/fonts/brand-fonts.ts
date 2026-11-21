import config from '../config/brand-fonts.json' with { type: 'json' };

type FontRole = keyof typeof config.faces;
type FontSurface = 'app' | 'public' | 'docs';
type Face = (typeof config.faces)[FontRole];

const ROLES: readonly FontRole[] = ['display', 'sans', 'mono'];

const FALLBACK_LOCAL: Record<FontRole, string> = {
  display: 'Arial',
  sans: 'Arial',
  mono: 'Courier New',
};

export function brandFontName(role: FontRole): string {
  return `CiteLadder ${config.faces[role].family}`;
}

function brandFontPreloads(surface: FontSurface): string[] {
  return ROLES.filter((role) => config.faces[role].preload.includes(surface)).map(
    (role) => `/fonts/${config.faces[role].file}`,
  );
}

function hostedFace(role: FontRole, face: Face): string {
  return `@font-face {
  font-family: '${brandFontName(role)}';
  src: url('/fonts/${face.file}') format('woff2');
  font-weight: ${face.weights};
  font-style: normal;
  font-display: fallback;
}`;
}

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

export function brandFontHead(surface: FontSurface): string {
  const preloads = brandFontPreloads(surface).map(
    (href) =>
      `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin="anonymous" />`,
  );
  return [...preloads, `<style>\n${brandFontCss()}\n</style>`].join('\n');
}
