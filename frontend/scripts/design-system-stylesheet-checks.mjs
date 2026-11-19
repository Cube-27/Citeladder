import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { escapeRegExp } from './design-system-class-data.mjs';
import { TOKEN_CSS } from './design-system-source-checks.mjs';
import { marketingCssFiles, readMarketingCss } from './marketing-css.mjs';

/** Geometry roles belong to one ladder in globals.css; no surface re-scales them. */
const SHARED_GEOMETRY_ROLES = [
  'mark',
  'control',
  'card',
  'overlay',
  'sheet',
  '2xs',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  'full',
].map((size) => `--radius-${size}`);

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

/** Shared token completeness and relative scale consistency; appearance belongs to docs/design.md. */
export function productContractViolations(root) {
  const violations = [];
  const css = readFileSync(join(root, ...TOKEN_CSS.split('/')), 'utf8');
  // The website's components own its type roles (the `cl-*` titles, lead, body and note).
  const websiteCss = readMarketingCss(root);
  // Every role the product builds on has to be defined somewhere. The value is
  // the design system's to choose: pinning `--color-accent` to a literal hex
  // meant a rebrand failed a test rather than a review.
  // The system's own tokens are pinned by design-system-contract.mjs; these are
  // the component geometry roles the product derives from them.
  const requiredTokens = [
    '--content-gutter',
    '--content-max-width',
    '--workspace-gap',
    '--compact-gap',
    '--page-section-gap',
    '--card-padding',
    '--modal-padding',
    '--control-coarse',
    '--tag-height',
    '--target-min',
    '--masthead-height',
    '--page-tabs-height',
    '--filter-bar-height',
    '--sidebar-width-compact',
    '--page-top-gap',
    '--flow-gap',
    '--mark-width',
    '--table-row-height',
    '--table-header-height',
    '--site-gutter',
  ];
  for (const token of requiredTokens) {
    if (!new RegExp(escapeRegExp(token) + String.raw`\s*:\s*[^;]+;`).test(css)) {
      violations.push(`${TOKEN_CSS}: ${token} must be defined`);
    }
  }
  // The type ladder is ordered even though its absolute sizes are free.
  const TYPE_SCALE = [
    '--text-caption',
    '--text-body-sm',
    '--text-body',
    '--text-body-lg',
    '--text-lead',
    '--text-title',
    '--text-display-md',
    '--text-display-lg',
  ];
  const scale = TYPE_SCALE.map((token) => {
    const match = new RegExp(escapeRegExp(token) + String.raw`\s*:\s*([\d.]+)rem\s*;`).exec(css);
    return { token, size: match ? Number(match[1]) : null };
  });
  for (const { token, size } of scale) {
    if (size === null) violations.push(`${TOKEN_CSS}: ${token} must be a rem size`);
  }
  const sized = scale.filter((step) => step.size !== null);
  for (let index = 1; index < sized.length; index += 1) {
    if (sized[index].size <= sized[index - 1].size) {
      violations.push(
        `${TOKEN_CSS}: ${sized[index].token} must be larger than ${sized[index - 1].token}`,
      );
    }
  }
  if (/\.website-type\b/.test(css + websiteCss)) {
    violations.push(`${TOKEN_CSS}: retired .website-type palette boundary must not return`);
  }
  // The class itself is gone from the shell, so guarding only the palette-override
  // shape would be an assertion that can never fire. Keep the namespace retired.
  if (/\.product-app\b/.test(css)) {
    violations.push(`${TOKEN_CSS}: the retired product-app palette scope must not return`);
  }

  return violations;
}

/** The landing page's theme rules, on every website stylesheet: the shared base, components and product screens. */
export function landingThemeViolations(root) {
  return marketingCssFiles(root).flatMap((file) =>
    websiteStyleViolations(readFileSync(join(root, ...file.split('/')), 'utf8'), file),
  );
}

/** A non-zero length literal: a radius written as a number rather than a token. */
const LENGTH_LITERAL = /(?<![\w.-])(?:\d*[1-9]\d*(?:\.\d+)?|\d*\.\d*[1-9]\d*)(?:px|rem|em|%)/i;

/**
 * The website's theme rules for one stylesheet or Astro `<style>` text:
 * colours and radii come from the token file, text is at least 12px and
 * transitions name their properties.
 * @public — also imported by check-design-system.mjs for Astro styles.
 */
export function websiteStyleViolations(source, file) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = [];
  if (/#[\da-f]{3,8}\b/i.test(css) || /(?<![\w-])(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i.test(css))
    violations.push(`${file}: component colours must use semantic tokens`);
  const radii = css.matchAll(
    /(?:^|[;{\s])(?:border(?:-[a-z]+)*-radius|--[\w-]*radius[\w-]*)\s*:\s*([^;{}]*)/gi,
  );
  if ([...radii].some(([, value]) => LENGTH_LITERAL.test(value)))
    violations.push(`${file}: radii must come from the token file's radius tokens`);
  if (/font-size\s*:\s*(?:1[01](?:\.\d+)?|\d(?:\.\d+)?|\.\d+)px\b/i.test(css))
    violations.push(`${file}: rendered text must be at least 12px`);
  const transitionDeclarations = css.matchAll(
    /(?:^|[;{])\s*transition(?:-property)?\s*:\s*([^;{}]*)/gi,
  );
  if ([...transitionDeclarations].some(([, value]) => /(?:^|[\s,])all(?=$|[\s,])/i.test(value)))
    violations.push(`${file}: transitions must name their properties`);
  return violations;
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

  for (const role of SHARED_GEOMETRY_ROLES) {
    if (new RegExp(escapeRegExp(role) + String.raw`\s*:`).test(websiteCss)) {
      violations.push(
        cssLabel + ': ' + role + ' is a shared geometry role and must not be redefined per surface',
      );
    }
  }

  return violations;
}
