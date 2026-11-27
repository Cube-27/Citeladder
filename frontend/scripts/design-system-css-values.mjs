import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

import { TOKEN_FILES } from './design-system-contrast.mjs';
import { NAMED_COLOURS } from './named-colours.mjs';

const SIDES = ['', '-top', '-right', '-bottom', '-left'].concat(
  ['-block', '-inline'].flatMap((axis) => [axis, `${axis}-start`, `${axis}-end`]),
);
const sided = (names, suffix = '') =>
  names.flatMap((name) => SIDES.map((side) => `${name}${side}${suffix}`));
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].concat([
  'start-start',
  'start-end',
  'end-start',
  'end-end',
]);
const CHECKED = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'fill',
  'stroke',
  'box-shadow',
  'text-shadow',
  'font',
  'font-size',
  'line-height',
  'font-weight',
  'letter-spacing',
  'z-index',
  'opacity',
  'transition',
  'transition-duration',
  'transition-delay',
  'animation',
  'animation-duration',
  'animation-delay',
  'outline-color',
  'caret-color',
  'text-decoration-color',
  'accent-color',
  'column-rule-color',
  'scrollbar-color',
  ...sided(['border'], '-color'),
  ...sided(['padding', 'margin', 'scroll-padding', 'scroll-margin', 'inset']),
  'gap',
  'row-gap',
  'column-gap',
  'top',
  'right',
  'bottom',
  'left',
  ...sided(['border', 'outline']),
  ...sided(['border', 'outline'], '-width'),
  ...['width', 'height', 'inline-size', 'block-size'].flatMap((size) => [
    size,
    `min-${size}`,
    `max-${size}`,
  ]),
  'flex-basis',
  'border-radius',
  ...CORNERS.map((corner) => `border-${corner}-radius`),
  'outline-offset',
  'text-decoration-thickness',
  'text-underline-offset',
]);
const BARE_NUMBER_PROPERTY = /^(z-index|font-weight|line-height|opacity)$/;
const RAW_UNIT = /^(px|rem|em|ms|s)$/i;
const COLOUR_FUNCTION = /^(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)$/i;
const GRADIENT = /gradient$/i;
const EXEMPT_MEDIA = /forced-colors|prefers-reduced-motion:\s*reduce/;
const SKIPPED_AT_RULE = /^(theme|font-face|keyframes|property)$/;
const ROOT_COMPOUND = /^:root(?:\[[^\]]*\]|:not\([^()]*\))*$/;
const GLOBAL_KEYWORD = /^(inherit|initial|unset|revert|revert-layer)$/i;

const fullOpacity = (property, number) => property === 'opacity' && Number(number.number) === 1;

function rawParts(value, property, { tokenFile }) {
  const found = [];
  const bareOnly = BARE_NUMBER_PROPERTY.test(property);
  const walk = (nodes, inGradient) =>
    valueParser.walk(nodes, (node) => {
      if (node.type === 'function' && GRADIENT.test(node.value)) {
        walk(node.nodes, true);
        return false;
      }
      return visit(node, inGradient);
    });
  const visitVar = ([name, ...rest], inGradient) => {
    if (tokenFile) return false;
    if (name?.value.startsWith('--ramp-')) found.push(`var(${name.value})`);
    const fallback = rest.slice(rest.findIndex((node) => node.type === 'div') + 1);
    if (rest.length) walk(fallback, inGradient);
    return false;
  };
  const visit = (node, inGradient) => {
    if (node.type === 'function' && node.value === 'var') return visitVar(node.nodes, inGradient);
    if (node.type === 'function' && COLOUR_FUNCTION.test(node.value)) {
      found.push(valueParser.stringify(node));
      return false;
    }
    if (property === 'font-family' && (node.type === 'string' || node.type === 'word')) {
      if (!GLOBAL_KEYWORD.test(node.value)) found.push(node.value);
      return undefined;
    }
    if (node.type !== 'word') return undefined;
    const named = !property.startsWith('mask') && NAMED_COLOURS.has(node.value.toLowerCase());
    if (/^#[0-9a-f]{3,8}$/i.test(node.value) || named) found.push(node.value);
    const number = valueParser.unit(node.value);
    if (!number || Number(number.number) === 0 || fullOpacity(property, number)) return undefined;
    const rawUnit = RAW_UNIT.test(number.unit) && !inGradient;
    const bare =
      bareOnly &&
      ['', '%'].includes(number.unit) &&
      (property === 'opacity' || value.trim() === node.value);
    if (rawUnit || bare) found.push(node.value);
    return undefined;
  };
  walk(valueParser(value).nodes, false);
  return found;
}

function exempt(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== 'atrule') continue;
    if (SKIPPED_AT_RULE.test(parent.name)) return true;
    if (EXEMPT_MEDIA.test(parent.params)) return true;
  }
  return false;
}

const rootToken = (decl) =>
  decl.parent?.type === 'rule' &&
  decl.parent.selectors.every((selector) => ROOT_COMPOUND.test(selector.trim()));

function declarationParts(decl, tokenFile) {
  const property = decl.prop.toLowerCase();
  const custom = property.startsWith('--');
  if ((custom && tokenFile) || exempt(decl)) return [];
  const parts = rawParts(decl.value, property, { tokenFile });
  if (CHECKED.has(property) || (custom && !rootToken(decl))) return parts;
  return parts.filter((part) => /^(?:[#a-z]|var\()/i.test(part));
}

export function cssValueFindings(label, css, { offsetLine = 0 } = {}) {
  const tokenFile = TOKEN_FILES.includes(label);
  const findings = [];
  postcss.parse(css).walkDecls((decl) => {
    const raw = declarationParts(decl, tokenFile);
    if (!raw.length) return;
    const line = (decl.source?.start?.line ?? 0) + offsetLine;
    findings.push(
      `${label}:${line}: ${decl.prop}: ${decl.value} holds ${raw.join(', ')}; use a role token`,
    );
  });
  return findings;
}

export function astroStyleFindings(label, source) {
  return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].flatMap((match) => {
    const start = match.index + match[0].indexOf('>') + 1;
    const offsetLine = source.slice(0, start).split('\n').length - 1;
    return cssValueFindings(label, match[1], { offsetLine });
  });
}
