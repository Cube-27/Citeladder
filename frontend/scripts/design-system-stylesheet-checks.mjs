import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { escapeRegExp } from './design-system-class-data.mjs';
import { marketingCssFiles, readMarketingCss } from './marketing-css.mjs';

/**
 * Roles that must take their color from a token rather than a literal.
 *
 * Which token is a design decision — moving a role from `--color-ink-secondary`
 * to `--color-ink-muted` is a legitimate change and no longer fails here. Reaching for
 * a raw hex is not, because it escapes theming and the contrast check below.
 */
const TOKEN_COLORED_ROLES = [
  '.cl-phero-title',
  '.cl-lhero-title',
  '.cl-shead-title',
  '.cl-fcard-title',
  '.cl-lead',
  '.cl-body',
  '.cl-note',
];

/** Every website stylesheet's colours: the shared base, components and product screens. */
export function landingThemeViolations(root) {
  return marketingCssFiles(root).flatMap((file) =>
    websiteStyleViolations(readFileSync(join(root, ...file.split('/')), 'utf8'), file),
  );
}

/**
 * Colours in one website stylesheet or Astro `<style>` text come from the
 * token file, so both themes repaint them. Radii, type sizes and transitions
 * are the owner's choice (owner, 2026-11-20).
 * @public — also imported by check-design-system.mjs for Astro styles.
 */
export function websiteStyleViolations(source, file) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return /#[\da-f]{3,8}\b/i.test(css) ||
    /(?<![\w-])(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i.test(css)
    ? [`${file}: component colours must use semantic tokens`]
    : [];
}

/** The index just past the `}` that balances the `{` at `open`, or -1 when unbalanced. */
function blockEnd(text, open) {
  let depth = 1;
  let close = open + 1;
  while (close < text.length && depth > 0) {
    if (text[close] === '{') depth += 1;
    if (text[close] === '}') depth -= 1;
    close += 1;
  }
  return depth === 0 ? close : -1;
}

function cssRules(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const open = clean.indexOf('{', cursor);
    if (open === -1) break;
    const prelude = clean.slice(cursor, open).trim();
    const close = blockEnd(clean, open);
    if (close === -1) break;
    if (prelude && !prelude.startsWith('@')) {
      rules.push({ prelude, body: clean.slice(open + 1, close - 1) });
    }
    cursor = close;
  }
  return rules;
}

function selectorPattern(selector) {
  return new RegExp(escapeRegExp(selector) + String.raw`(?![\w-])`);
}

export function websiteContractViolations(root) {
  const violations = [];
  const cssLabel = 'website CSS (site-base.css and components/marketing/**/*.css)';
  const websiteCss = readMarketingCss(root);
  const rules = cssRules(websiteCss);

  for (const selector of TOKEN_COLORED_ROLES) {
    const selectorRegex = selectorPattern(selector);
    const scoped = rules.filter((rule) => selectorRegex.test(rule.prelude));
    const colors = scoped.flatMap((rule) => [
      ...rule.body.matchAll(/(?:^|[;{]|\s)color\s*:([^;]+)/g),
    ]);
    if (!colors.length) {
      violations.push(cssLabel + ': ' + selector + ' must declare a color');
      continue;
    }
    for (const [, value] of colors) {
      if (!/var\(\s*--/.test(value)) {
        violations.push(
          cssLabel + ': ' + selector + ' must take its color from a token, not ' + value.trim(),
        );
      }
    }
  }

  return violations;
}
