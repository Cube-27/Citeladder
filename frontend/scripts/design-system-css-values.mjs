import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

const VALUE_PROPERTY =
  /^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-color|outline-color|fill|stroke|box-shadow|text-shadow|font-size|line-height|font-weight|letter-spacing|z-index|transition(-duration|-delay)?|animation(-duration|-delay)?|text-decoration-color|caret-color|accent-color|column-rule-color|scrollbar-color|font)$/;
const SPACING_PROPERTY =
  /^(padding|margin|scroll-padding|scroll-margin)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap|inset(-(block|inline)(-(start|end))?)?|top|right|bottom|left)$/;
const WIDTH_PROPERTY =
  /^(border|outline)(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-width)?$|^(outline-offset|text-decoration-thickness|text-underline-offset)$/;
const BARE_NUMBER_PROPERTY = /^(z-index|font-weight|line-height)$/;
const RAW_UNIT = /^(px|rem|em|ms|s)$/i;
const COLOUR_FUNCTION = /^(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)$/i;
const GRADIENT = /gradient$/i;
const EXEMPT_MEDIA = /forced-colors|prefers-reduced-motion/;
const SKIPPED_AT_RULE = /^(theme|font-face|keyframes|property)$/;

function rawParts(value, property) {
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
  const visit = (node, inGradient) => {
    if (node.type === 'function' && node.value === 'var') return false;
    if (node.type === 'function' && COLOUR_FUNCTION.test(node.value)) {
      found.push(valueParser.stringify(node));
      return false;
    }
    if (node.type !== 'word') return undefined;
    if (/^#[0-9a-f]{3,8}$/i.test(node.value)) found.push(node.value);
    const number = valueParser.unit(node.value);
    if (!number || Number(number.number) === 0) return undefined;
    if (RAW_UNIT.test(number.unit) && !inGradient) found.push(node.value);
    else if (bareOnly && number.unit === '' && value.trim() === node.value) found.push(node.value);
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

export function cssValueFindings(label, css, { offsetLine = 0 } = {}) {
  const findings = [];
  postcss.parse(css).walkDecls((decl) => {
    const property = decl.prop.toLowerCase();
    if (property.startsWith('--') || exempt(decl)) return;
    const checked =
      VALUE_PROPERTY.test(property) ||
      SPACING_PROPERTY.test(property) ||
      WIDTH_PROPERTY.test(property);
    const raw = checked
      ? rawParts(decl.value, property)
      : rawParts(decl.value, property).filter((part) => /^[#a-z]/i.test(part));
    if (!raw.length) return;
    const line = (decl.source?.start?.line ?? 0) + offsetLine;
    findings.push(
      `${label}:${line}: ${property}: ${decl.value} holds ${raw.join(', ')}; use a role token`,
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
