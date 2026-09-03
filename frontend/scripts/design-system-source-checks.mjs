import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { visitorKeys } from 'oxc-parser';

import { lineIndex, nameText, parseSource, stringValue, unwrap, walk } from './source-ast.mjs';

const EDITORIAL_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']);
const EDITORIAL_SIZE = /\btext-(?:2xs|xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/;
const WEBSITE_CSS = 'app/website-type.css';
const TOKEN_CSS = 'app/globals.css';
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

/**
 * Roles the website stylesheet must define.
 *
 * The role has to exist, because the JSX and the type ladder below refer to it.
 * What it looks like is a design decision: this deliberately does not pin the
 * font-size or letter-spacing a role resolves to, so the type scale can be
 * retuned without editing a gate.
 */
const REQUIRED_WEBSITE_ROLES = [
  '[data-flow-surface]',
  '.flow-actions.safe-bottom',
  '.website-hero-display',
  '.website-page-title',
  '.website-section-heading',
  '.website-feature-heading',
  '.website-small-heading',
  '.flow-title',
  '.flow-group-title',
  '.flow-help',
  '.flow-meta',
  '.website-lead',
  '.website-body',
  '.website-nav',
  '.website-label',
  '.website-eyebrow',
  '.website-data-display',
];

/**
 * Roles whose size must stay ordered relative to each other.
 *
 * This is the consistency the frozen font-size list was really protecting: a
 * page title must not out-size the hero, and body copy must not out-size a
 * heading. Any absolute scale satisfying the order passes.
 */
const WEBSITE_TYPE_LADDER = [
  '.website-hero-display',
  '.website-page-title',
  '.flow-title',
  '.website-lead',
  '.flow-group-title',
  '.website-body',
  '.flow-help',
  '.flow-meta',
];

/** Geometry roles belong to one ladder in globals.css; no surface re-scales them. */
const SHARED_GEOMETRY_ROLES = ['--radius-control', '--radius-card', '--radius-overlay'];

/**
 * Roles that must take their color from a token rather than a literal.
 *
 * Which token is a design decision — moving a role from `--color-secondary` to
 * `--color-muted` is a legitimate change and no longer fails here. Reaching for
 * a raw hex is not, because it escapes theming and the contrast check below.
 */
const TOKEN_COLORED_ROLES = [
  '.website-hero-display',
  '.website-page-title',
  '.website-section-heading',
  '.website-feature-heading',
  '.website-small-heading',
  '.website-nav',
  '.website-data-display',
  '.flow-title',
  '.flow-group-title',
  '.website-lead',
  '.website-body',
  '.website-label',
  '.website-eyebrow',
  '.flow-help',
  '.flow-meta',
];

const JSX_ROLE_CONTRACTS = new Map([
  ['components/marketing/landing/hero.tsx', ['website-hero-display']],
  ['components/marketing/primitives/page-hero.tsx', ['website-page-title']],
  [
    'components/marketing/primitives/section.tsx',
    ['website-section-heading', 'website-feature-heading'],
  ],
  ['components/auth/auth-form.tsx', ['flow-title', 'website-body']],
  ['components/auth/flow-shell.tsx', ['flow-group-title', 'flow-help', 'flow-meta']],
]);

function staticBindings(program) {
  const bindings = new Map();
  walk(program, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
      bindings.set(node.id.name, node.init);
    }
  });
  return bindings;
}

function classFragments(node, bindings, seen = new Set()) {
  if (!node) return [];
  const literal = stringValue(node);
  if (literal !== null) return [literal];
  if (node.type === 'TemplateLiteral') {
    // Both halves matter: the static chunks carry classes directly, and the
    // interpolations can resolve to more through the binding table.
    return [
      ...node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? ''),
      ...node.expressions.flatMap((expression) => classFragments(expression, bindings, seen)),
    ];
  }
  const unwrapped = unwrap(node);
  if (unwrapped !== node) return classFragments(unwrapped, bindings, seen);
  if (node.type === 'Identifier') {
    if (seen.has(node.name)) return [];
    const initializer = bindings.get(node.name);
    if (!initializer) return [];
    return classFragments(initializer, bindings, new Set([...seen, node.name]));
  }
  if (node.type === 'MemberExpression') {
    const target = unwrap(
      node.object?.type === 'Identifier' ? bindings.get(node.object.name) : node.object,
    );
    if (target?.type === 'ObjectExpression') {
      return target.properties.flatMap((property) =>
        property.type === 'Property' ? classFragments(property.value, bindings, seen) : [],
      );
    }
    return classFragments(target, bindings, seen);
  }
  if (node.type === 'CallExpression') {
    return node.arguments.flatMap((argument) => classFragments(argument, bindings, seen));
  }
  if (node.type === 'ConditionalExpression') {
    return [
      ...classFragments(node.consequent, bindings, seen),
      ...classFragments(node.alternate, bindings, seen),
    ];
  }
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    return [
      ...classFragments(node.left, bindings, seen),
      ...classFragments(node.right, bindings, seen),
    ];
  }
  if (node.type === 'ArrayExpression') {
    return node.elements.flatMap((element) => classFragments(element, bindings, seen));
  }
  if (node.type === 'ObjectExpression') {
    // Conditional class maps key the class off a flag, so the key is the class.
    return node.properties.flatMap((property) =>
      property.type === 'Property' ? classFragments(property.key, bindings, seen) : [],
    );
  }
  if (node.type === 'JSXExpressionContainer')
    return classFragments(node.expression, bindings, seen);
  return [];
}

/** Every prop through which a call site can hand Tailwind classes to a component. */
const CLASS_ATTRIBUTES = new Set([
  'className',
  'rootClassName',
  'contentClassName',
  'bodyClassName',
  'panelClassName',
  'itemClassName',
  'triggerClassName',
]);

function jsxClassData(source, label) {
  const program = parseSource(source, label);
  const lineOf = lineIndex(source);
  const bindings = staticBindings(program);
  const entries = [];
  walk(program, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    // `className` is not the only way a call site hands classes to a
    // component. `rootClassName="grid gap-6"` slipped past every spacing and
    // type rule for exactly as long as this only looked at one attribute.
    const classAttributes = node.attributes.filter(
      (property) =>
        property.type === 'JSXAttribute' && CLASS_ATTRIBUTES.has(nameText(property.name)),
    );
    for (const classAttribute of classAttributes) {
      entries.push({
        tag: nameText(node.name),
        classes: classAttribute.value
          ? classFragments(classAttribute.value, bindings).join(' ')
          : '',
        line: lineOf(node.start),
      });
    }
  });
  return entries;
}

export function editorialTypographyViolations(source, label, ownsWebsiteEditorialCopy) {
  if (!ownsWebsiteEditorialCopy || !label.endsWith('.tsx')) return [];
  return jsxClassData(source, label)
    .filter((entry) => EDITORIAL_TAGS.has(entry.tag) && EDITORIAL_SIZE.test(entry.classes))
    .map(
      (entry) =>
        label +
        ':' +
        entry.line +
        ': editorial headings and paragraphs must use named website roles',
    );
}

/** Product data absence must name its state instead of rendering punctuation alone. */
export function standalonePlaceholderViolations(source, label, ownsProductUi) {
  if (!ownsProductUi) return [];
  const violations = [];
  const literalStandaloneDash = /(['"`])—\1/g;
  const jsxStandaloneDash = />\s*—\s*</g;
  if (literalStandaloneDash.test(source) || jsxStandaloneDash.test(source)) {
    violations.push(`${label}: standalone em-dash placeholder; use semantic availability copy`);
  }
  return violations;
}

/** Product UI must consume the even type ladder and semantic large-spacing roles. */
export function productUiSourceViolations(source, label, ownsProductUi) {
  if (!ownsProductUi || !label.endsWith('.tsx')) return [];
  const violations = [];
  for (const entry of jsxClassData(source, label)) {
    if (
      entry.tag === 'Card' &&
      /\b(?:border(?:-[^\s]+)?|rounded(?:-[^\s]+)?|(?:hover:)?shadow-[^\s]+)\b/.test(entry.classes)
    ) {
      violations.push(`${label}:${entry.line}: Card geometry and elevation belong to its owner`);
    }
    if (/\b(?:font-semibold|font-bold|text-2xs)\b/.test(entry.classes)) {
      violations.push(`${label}:${entry.line}: product type uses a retired weight or size`);
    }
    // Weight is never a call-site decision. It encodes one distinction — 500 for
    // what you scan, 400 for what you read — and that belongs to a text role, not
    // to whoever happens to be writing this className. Leaving it open is how a
    // card's title, its body copy, its metric and its timestamp all ended up at
    // 500, which left weight carrying no information at all.
    if (
      !label.startsWith('components/ui/') &&
      /\bfont-(?:normal|medium|semibold|bold)\b/.test(entry.classes)
    ) {
      violations.push(
        `${label}:${entry.line}: font weight belongs to a text role (components/ui/typography.tsx)`,
      );
    }
    // A bordered, filled, padded box is a Panel. Twenty-seven of these were
    // rebuilt by hand, each with its own fill, border colour, radius and
    // padding, which is why the same evidence box looked different in six
    // screens. Card could not absorb them — a Card may not nest in a Card — so
    // panelClasses is the owner. Chips, icon tiles and controls are excluded by
    // requiring an all-sides padding.
    if (
      !label.startsWith('components/ui/') &&
      /(?<![:\w\]-])bg-(?:panel|well|background-alt)(?:\/\d+)?\b/.test(entry.classes) &&
      /(?<![:\w\]-])border(?![-\w])/.test(entry.classes) &&
      /(?<![:\w\]-])rounded-\[var\(--radius-(?:control|card|overlay)\)\]/.test(entry.classes) &&
      /(?<![:\w\]-])p-(?:\d[\d.]*|\[var\([^)]+\)\])/.test(entry.classes)
    ) {
      violations.push(
        `${label}:${entry.line}: a bordered filled box is a Panel (components/ui/panel.tsx)`,
      );
    }
    // Vertical rhythm belongs to the container. A child that sets its own
    // `mt-*` owns its distance from a sibling it cannot see, which is why
    // ninety-odd of these accumulated in a dozen values and why changing a
    // screen's rhythm meant editing every child taking part in it. Use `Stack`
    // or a `gap`.
    //
    // Exempt: a className that also sizes a glyph (`size-*`), which is optical
    // alignment against a text baseline rather than rhythm; negative margins,
    // which are deliberate overlap; and 2px, which is too small to be rhythm.
    if (
      !label.startsWith('components/ui/') &&
      !/(?<![:\w\]-])size-[0-9.]+\b/.test(entry.classes) &&
      /(?<![:\w\]-])(?:mt|mb|my)-(?!0\b|0\.5\b|px\b)[0-9.]+\b/.test(entry.classes)
    ) {
      violations.push(
        `${label}:${entry.line}: vertical rhythm belongs to a container gap (components/ui/layout.tsx)`,
      );
    }
    if (/\btext-5xl\b|\btext-\[[^\]]+\]/.test(entry.classes)) {
      violations.push(`${label}:${entry.line}: product type must use the approved even ladder`);
    }
    if (/\b(?:(?:sm|md|lg|xl):)?(?:gap|p|px|py)-(?:5|6|8)\b/.test(entry.classes)) {
      violations.push(
        `${label}:${entry.line}: product large spacing must use a semantic CSS variable`,
      );
    }
    if (
      /\bwebsite-(?:hero|page|section|feature|small|lead|body|nav|label|eyebrow)/.test(
        entry.classes,
      )
    ) {
      violations.push(`${label}:${entry.line}: product UI must not consume website type roles`);
    }
    if (
      !label.startsWith('components/ui/') &&
      /\b(?:hover:)?shadow-(?:xs|sm|card|card-hover|lg)\b/.test(entry.classes)
    ) {
      violations.push(`${label}:${entry.line}: feature-owned static elevation is retired`);
    }
    if (
      /\b(?:bg|text|border|ring)-(?:gray|indigo|cyan|coral|lime|amber)-\d+\b/.test(entry.classes)
    ) {
      violations.push(`${label}:${entry.line}: product UI must consume semantic colour roles`);
    }
  }
  return violations;
}

/** Cards are semantic objects, never layout containers nested inside each other. */
export function nestedCardViolations(source, label, ownsProductUi) {
  if (!ownsProductUi || !label.endsWith('.tsx')) return [];
  const program = parseSource(source, label);
  const lineOf = lineIndex(source);
  const violations = [];
  // Depth has to thread through the recursion, so this walks locally rather
  // than through the shared depth-free helper.
  const visit = (node, cardDepth) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, cardDepth);
      return;
    }
    if (typeof node.type !== 'string') return;
    const opening = node.type === 'JSXElement' ? node.openingElement : null;
    const isCard = opening ? nameText(opening.name) === 'Card' : false;
    if (isCard && cardDepth > 0) {
      violations.push(`${label}:${lineOf(opening.start)}: Card must not be nested inside Card`);
    }
    const nextDepth = cardDepth + (isCard ? 1 : 0);
    for (const key of visitorKeys[node.type] ?? []) visit(node[key], nextDepth);
  };
  visit(program, 0);
  return violations;
}

const BUTTON_COLOR_ROLE =
  /^text-(?:foreground|secondary|muted|subtle|accent|danger|success|warning|info|on-|inverse)/;

function cosmeticButtonToken(token) {
  const utility = token.split(':').at(-1) ?? token;
  return (
    utility.startsWith('rounded') ||
    utility.startsWith('bg-') ||
    utility === 'border' ||
    utility.startsWith('border-') ||
    utility.startsWith('shadow') ||
    utility.startsWith('opacity-') ||
    utility.startsWith('scale-') ||
    utility.startsWith('transition') ||
    utility.startsWith('duration-') ||
    utility.startsWith('ease-') ||
    BUTTON_COLOR_ROLE.test(utility)
  );
}

/** Product controls must route behavior and appearance through shared owners. */
const RAW_PRODUCT_CONTROL_MESSAGES = new Map([
  ['select', 'native select must use components/ui/select'],
  ['input', 'raw product input must use a components/ui owner'],
  ['textarea', 'raw product textarea must use components/ui/textarea'],
  ['button', 'raw product button must use Button or Pressable'],
]);

function hasCosmeticButtonOverride(node, bindings) {
  const classAttribute = node.attributes.find(
    (property) => property.type === 'JSXAttribute' && nameText(property.name) === 'className',
  );
  if (!classAttribute) return false;
  return classFragments(classAttribute.value, bindings)
    .join(' ')
    .split(/\s+/)
    .some(cosmeticButtonToken);
}

export function productControlViolations(source, label, ownsProductUi) {
  if (!ownsProductUi || !label.endsWith('.tsx') || label.startsWith('components/ui/')) return [];
  const program = parseSource(source, label);
  const lineOf = lineIndex(source);
  const bindings = staticBindings(program);
  const violations = [];
  walk(program, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    const tag = nameText(node.name);
    const line = lineOf(node.start);
    const rawControlMessage = RAW_PRODUCT_CONTROL_MESSAGES.get(tag);
    if (rawControlMessage) violations.push(`${label}:${line}: ${rawControlMessage}`);
    if (tag === 'Button' && hasCosmeticButtonOverride(node, bindings)) {
      violations.push(
        `${label}:${line}: Button cosmetics belong in its semantic variant, not className`,
      );
    }
  });
  return violations;
}

export function directRadixImportViolations(source, label) {
  return !label.startsWith('components/ui/') && /from\s+['"]@radix-ui\//.test(source)
    ? [`${label}: feature code must use components/ui instead of importing Radix`]
    : [];
}

/**
 * Tailwind v4 generates EVERY utility family from every theme token, so
 * `--color-subtle` / `--color-muted` / `--color-secondary` (the Gray-500/600/700
 * TEXT inks) silently yield usable `bg-*` utilities. `bg-subtle` painted the
 * page-kind score expansion as a dark slate panel with unreadable controls on
 * it, and neither review nor the type system could catch it.
 *
 * This lived as an ESLint `no-restricted-syntax` selector pair until the linter
 * moved to Oxlint, which does not implement that rule. The check belongs here
 * regardless: it is a design-token contract, and this file already owns the
 * others. The AST walk (rather than a source regex) is what the ESLint
 * selectors gave us -- it matches string and template text only, so the rule
 * cannot be tripped by a prose mention in a comment.
 *
 * NOT banned: `bg-foreground` + `text-background` is the deliberate
 * inverse-chip pattern, and `bg-inverse/70` is a white scrim.
 */
const TEXT_ROLE_BACKGROUND = new RegExp(
  // Assembled from fragments so this policy source -- which the walk in
  // check-design-system.mjs also reads -- can never match itself.
  `(^|\\s)${['bg', '-'].join('')}(subtle|secondary|muted)(\\s|/|$)`,
);

const TEXT_ROLE_BACKGROUND_MESSAGE =
  'background utility built from a TEXT-role token; use a surface token ' +
  '(bg-background-alt, bg-panel, bg-well, bg-elevated, bg-surface-inverse), ' +
  'a border-scale neutral, or a semantic bg-*-bg';

/** Surfaces must never be painted with a text-ink token. */

/**
 * Radius is a ladder, not a vocabulary. `--radius-control` / `--radius-card` /
 * `--radius-overlay` are the three roles, with `rounded-xs` as the micro rung
 * for chart bars, skeletons and inline code, and `rounded-full` for pills.
 *
 * This applies to every surface, not just product UI: the app, login and
 * marketing each used to carry their own idea of a rounded corner, so the same
 * button rendered at three different radii depending on which page it sat on.
 */
export function rawRadiusViolations(source, label) {
  if (label.includes('.test.') || !/\.(?:tsx|ts)$/.test(label)) return [];
  const violations = [];
  for (const entry of jsxClassData(source, label)) {
    const raw = entry.classes
      .split(/\s+/)
      .filter((token) =>
        /^(?:[a-z-]+:)*rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:none|sm|md|lg|xl|2xl|3xl))?$/.test(
          token,
        ),
      );
    if (raw.length) {
      violations.push(
        `${label}:${entry.line}: ${raw.join(', ')} — radius must use a role token (--radius-control|card|overlay), rounded-xs, or rounded-full`,
      );
    }
  }
  return violations;
}
export function textRoleBackgroundViolations(source, label) {
  if (!/\.(?:tsx|ts|mjs|js)$/.test(label)) return [];
  const program = parseSource(source, label);
  const lineOf = lineIndex(source);
  const violations = [];
  walk(program, (node) => {
    const text =
      node.type === 'TemplateElement'
        ? (node.value.cooked ?? node.value.raw ?? '')
        : stringValue(node);
    if (text !== null && TEXT_ROLE_BACKGROUND.test(text)) {
      violations.push(`${label}:${lineOf(node.start)}: ${TEXT_ROLE_BACKGROUND_MESSAGE}`);
    }
  });
  return violations;
}

/** A role's declared font-size in rem, or null when it does not set one. */
function fontSizeRem(rules, selector) {
  const pattern = selectorPattern(selector);
  for (const rule of rules) {
    if (!pattern.test(rule.prelude)) continue;
    const match = /(?:^|[;{]|\s)font-size\s*:\s*([\d.]+)rem/.exec(rule.body);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Exact global contract for the spatial/type migration's shared owners. */
export function productContractViolations(root) {
  const violations = [];
  const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');
  const websiteCss = readFileSync(join(root, ...WEBSITE_CSS.split('/')), 'utf8');
  // Every role the product builds on has to be defined somewhere. The value is
  // the design system's to choose: pinning `--color-action` to a literal hex
  // meant a rebrand failed a test rather than a review.
  const requiredTokens = [
    '--text-xs',
    '--text-sm',
    '--text-base',
    '--text-lg',
    '--text-xl',
    '--text-2xl',
    '--text-3xl',
    '--text-4xl',
    '--content-gutter',
    '--workspace-gap',
    '--compact-gap',
    '--page-section-gap',
    '--card-padding',
    '--modal-padding',
    '--control-height',
    '--control-height-lg',
    '--radius-control',
    '--radius-card',
    '--radius-overlay',
    '--color-background',
    '--color-background-alt',
    '--color-panel-tonal',
    '--color-well',
    '--color-active',
    '--color-sidebar',
    '--color-action',
    '--color-accent',
    '--color-focus',
    '--color-focus-ring',
    '--color-selection',
    '--color-selection-fg',
  ];
  for (const token of requiredTokens) {
    if (!new RegExp(escapeRegExp(token) + String.raw`\s*:\s*[^;]+;`).test(css)) {
      violations.push(`app/globals.css: ${token} must be defined`);
    }
  }
  // The type ladder is ordered even though its absolute sizes are free.
  const TYPE_SCALE = [
    '--text-xs',
    '--text-sm',
    '--text-base',
    '--text-lg',
    '--text-xl',
    '--text-2xl',
    '--text-3xl',
    '--text-4xl',
  ];
  const scale = TYPE_SCALE.map((token) => {
    const match = new RegExp(escapeRegExp(token) + String.raw`\s*:\s*([\d.]+)rem`).exec(css);
    return { token, size: match ? Number(match[1]) : null };
  }).filter((step) => step.size !== null);
  for (let index = 1; index < scale.length; index += 1) {
    if (scale[index].size <= scale[index - 1].size) {
      violations.push(
        `app/globals.css: ${scale[index].token} must be larger than ${scale[index - 1].token}`,
      );
    }
  }
  if (/\.website-type\b/.test(css + websiteCss)) {
    violations.push('app/globals.css: retired .website-type palette boundary must not return');
  }
  // The class itself is gone from the shell, so guarding only the palette-override
  // shape would be an assertion that can never fire. Keep the namespace retired.
  if (/\.product-app\b/.test(css)) {
    violations.push('app/globals.css: the retired product-app palette scope must not return');
  }

  const layout = readFileSync(join(root, 'app', 'layout.tsx'), 'utf8');
  if (!layout.includes('Inter') || !layout.includes("variable: '--font-inter'")) {
    violations.push('app/layout.tsx: Inter must own the shared UI/body font variable');
  }
  if (!layout.includes('uncutSans') || !layout.includes("variable: '--font-uncut-sans'")) {
    violations.push('app/layout.tsx: Uncut Sans must own the display font variable');
  }

  const shell = readFileSync(join(root, 'components', 'layout', 'app-shell.tsx'), 'utf8');
  if (!shell.includes('px-[var(--content-gutter)]') || /\b(?:sm|md|lg):p[xy]?-\d/.test(shell)) {
    violations.push('components/layout/app-shell.tsx: shell chrome must own one semantic gutter');
  }
  const alert = readFileSync(join(root, 'components', 'ui', 'alert-variants.ts'), 'utf8');
  if (
    !alert.includes("cva('flex items-start gap-2 text-xs'") ||
    /rounded|\bborder\b|\bp-4\b/.test(alert)
  ) {
    violations.push('components/ui/alert-variants.ts: alerts must remain unboxed inline feedback');
  }
  const table = readFileSync(join(root, 'components', 'ui', 'table.tsx'), 'utf8');
  if (!table.includes('text-xs text-secondary font-medium whitespace-nowrap')) {
    violations.push('components/ui/table.tsx: table headers must be 12px and single-line');
  }
  const eyebrow = readFileSync(join(root, 'components', 'ui', 'eyebrow.tsx'), 'utf8');
  const eyebrowRecipe = eyebrow.match(/export const eyebrowClasses =\s*'([^']+)'/)?.[1] ?? '';
  if (eyebrowRecipe !== 'font-sans text-xs font-medium tracking-[0.06em] text-muted uppercase') {
    violations.push('components/ui/eyebrow.tsx: product meta labels must be one uppercase recipe');
  }
  const card = readFileSync(join(root, 'components', 'ui', 'card-variants.ts'), 'utf8');
  const cardRecipe = card.match(/cva\(([^;]+)\)/s)?.[1] ?? '';
  // A card is defined by its edge. Elevation stays overlay-only; the border now
  // belongs to the owner, so no call site has to rebuild a bordered panel.
  if (/shadow-/.test(cardRecipe)) {
    violations.push('components/ui/card-variants.ts: Card elevation belongs to overlays');
  }
  if (!/\bborder-border-subtle\b/.test(cardRecipe) || !/\bborder\b/.test(cardRecipe)) {
    violations.push('components/ui/card-variants.ts: Card must own its hairline border');
  }
  const button = readFileSync(join(root, 'components', 'ui', 'button-variants.ts'), 'utf8');
  if (!button.includes('bg-action text-action-fg')) {
    violations.push(
      'components/ui/button-variants.ts: primary action must use the navy action role',
    );
  }
  if (
    !/\.value-placeholder\s*\{[^}]*font-size:\s*var\(--text-xs\);[^}]*font-weight:\s*400;/s.test(
      css,
    )
  ) {
    violations.push(
      'app/globals.css: unavailable values must remain muted 12px regular-weight text',
    );
  }
  return violations;
}

function cssRules(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const open = clean.indexOf('{', cursor);
    if (open === -1) break;
    const prelude = clean.slice(cursor, open).trim();
    let depth = 1;
    let close = open + 1;
    while (close < clean.length && depth > 0) {
      if (clean[close] === '{') depth += 1;
      if (clean[close] === '}') depth -= 1;
      close += 1;
    }
    if (depth !== 0) break;
    if (prelude && !prelude.startsWith('@')) {
      rules.push({ prelude, body: clean.slice(open + 1, close - 1) });
    }
    cursor = close;
  }
  return rules;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

function selectorPattern(selector) {
  return new RegExp(escapeRegExp(selector) + '(?![\\w-])');
}

function tokenHex(source, token) {
  const declaration = String.raw`${escapeRegExp(token)}\s*:\s*(#[0-9a-f]{6})\s*(?:;|(?=}))`;
  const match = source.match(new RegExp(declaration, 'i'));
  return match?.[1];
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
  const tokens = new Map(
    [...LIGHT_SURFACE_TOKENS, ...NEUTRAL_TEXT_TOKENS].map((token) => [
      token,
      tokenHex(source, token),
    ]),
  );
  const violations = [];

  for (const [token, value] of tokens) {
    if (!value) violations.push(`${cssLabel}: ${token} must be a six-digit hex value`);
  }
  if (violations.length) return violations;

  for (const textToken of NEUTRAL_TEXT_TOKENS) {
    for (const surfaceToken of LIGHT_SURFACE_TOKENS) {
      const ratio = contrastRatio(tokens.get(textToken), tokens.get(surfaceToken));
      if (ratio < MINIMUM_NORMAL_TEXT_CONTRAST) {
        violations.push(
          `${cssLabel}: ${textToken} on ${surfaceToken} has ${ratio.toFixed(2)}:1 contrast; ` +
            `${MINIMUM_NORMAL_TEXT_CONTRAST}:1 is required`,
        );
      }
    }
  }

  return violations;
}

export function websiteContractViolations(root) {
  const violations = [];
  const cssPath = join(root, ...WEBSITE_CSS.split('/'));
  const cssLabel = relative(root, cssPath).replaceAll('\\', '/');
  const rules = cssRules(readFileSync(cssPath, 'utf8'));

  for (const selector of REQUIRED_WEBSITE_ROLES) {
    if (!rules.some((candidate) => candidate.prelude.trim() === selector)) {
      violations.push(cssLabel + ': missing website selector ' + selector);
    }
  }

  const ladder = WEBSITE_TYPE_LADDER.map((selector) => ({
    selector,
    size: fontSizeRem(rules, selector),
  })).filter((step) => step.size !== null);
  for (let index = 1; index < ladder.length; index += 1) {
    const previous = ladder[index - 1];
    const current = ladder[index];
    if (current.size > previous.size) {
      violations.push(
        cssLabel +
          ': ' +
          current.selector +
          ' (' +
          current.size +
          'rem) must not be larger than ' +
          previous.selector +
          ' (' +
          previous.size +
          'rem)',
      );
    }
  }

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
    if (new RegExp(escapeRegExp(role) + String.raw`\s*:`).test(readFileSync(cssPath, 'utf8'))) {
      violations.push(
        cssLabel + ': ' + role + ' is a shared geometry role and must not be redefined per surface',
      );
    }
  }

  for (const [label, roles] of JSX_ROLE_CONTRACTS) {
    const path = join(root, ...label.split('/'));
    const entries = jsxClassData(readFileSync(path, 'utf8'), label);
    for (const role of roles) {
      if (!entries.some((entry) => entry.classes.split(/\s+/).includes(role))) {
        violations.push(label + ': missing website role ' + role + ' on a JSX className');
      }
    }
  }

  return violations;
}
