import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const TOKEN_CSS = 'apps/app/src/globals.css';
const MINIMUM_NORMAL_TEXT_CONTRAST = 4.5;
const LIGHT_SURFACE_TOKENS = [
  '--color-background',
  '--color-background-alt',
  '--color-panel',
  '--color-panel-tonal',
  '--color-well',
  '--color-active',
  '--color-sidebar',
];
const NEUTRAL_TEXT_TOKENS = [
  '--color-foreground',
  '--color-secondary',
  '--color-muted',
  '--color-subtle',
];

const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value ?? '');

function escapeRegExp(value) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, String.raw`\$&`);
}

/** Resolve inherited tokens and repeated scoped overrides before checking contrast. */
function resolvePalette(source, selector) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = (scope) => {
    const blocks = clean.matchAll(new RegExp(escapeRegExp(scope) + '\\s*\\{([^{}]*)\\}', 'g'));
    return [...blocks].flatMap(([, body]) =>
      [...body.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map(([, token, value]) => [
        token,
        value.trim(),
      ]),
    );
  };
  const values = new Map([
    ...declarations('@theme'),
    ...(selector === ":root[data-theme='dark']"
      ? declarations(':root:not([data-public-surface])')
      : []),
    ...declarations(selector),
  ]);
  const resolve = (token, seen = new Set()) => {
    if (seen.has(token)) return undefined;
    seen.add(token);
    const value = values.get(token);
    const alias = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
    return alias ? resolve(alias, seen) : value;
  };
  return new Map([...values.keys()].map((token) => [token, resolve(token)]));
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function textContrastViolations(root) {
  const cssPath = join(root, ...TOKEN_CSS.split('/'));
  const cssLabel = relative(root, cssPath).replaceAll('\\', '/');
  const source = readFileSync(cssPath, 'utf8');
  const violations = [];
  if (!/:root\[data-theme='dark'\]\s*\{/.test(source.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    violations.push(`${cssLabel}: dark theme token mapping is missing`);
  }

  // The base theme is a fallback, not the effective public/product palette.
  for (const scope of [
    ':root:not([data-public-surface])',
    '[data-public-surface]',
    ":root[data-theme='dark']",
  ]) {
    const palette = resolvePalette(source, scope);
    for (const textToken of NEUTRAL_TEXT_TOKENS) {
      for (const surfaceToken of LIGHT_SURFACE_TOKENS) {
        if (
          textToken === '--color-subtle' &&
          ['--color-panel-tonal', '--color-active'].includes(surfaceToken)
        )
          continue;
        const ink = palette.get(textToken);
        const surface = palette.get(surfaceToken);
        if (!isHex(ink) || !isHex(surface)) {
          violations.push(`${cssLabel}: ${scope} cannot resolve ${textToken} on ${surfaceToken}`);
        } else if (contrastRatio(ink, surface) < MINIMUM_NORMAL_TEXT_CONTRAST) {
          violations.push(
            `${cssLabel}: ${scope} ${textToken} on ${surfaceToken} needs 4.5:1 contrast`,
          );
        }
      }
    }
  }

  const darkPalette = resolvePalette(source, ":root[data-theme='dark']");
  for (let index = 1; index <= 8; index += 1) {
    const chartToken = `--color-chart-${index}`;
    const mark = darkPalette.get(chartToken);
    const surface = darkPalette.get('--color-panel');
    if (!isHex(mark) || !isHex(surface) || contrastRatio(mark, surface) < 3) {
      violations.push(`${cssLabel}: dark ${chartToken} needs 3:1 contrast on the product panel`);
    }
  }

  return violations;
}
