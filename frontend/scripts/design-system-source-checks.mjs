export { textContrastViolations } from './design-system-contrast.mjs';

import { jsxClassData } from './design-system-class-data.mjs';
import { lineIndex, nameText, parseSource, stringValue, walk } from './source-ast.mjs';

export const TOKEN_CSS = 'apps/app/src/globals.css';

const LINE_TERMINATOR = /[\n\r\p{Zl}\p{Zp}]/u;
const WHITESPACE = /\s/;

function lineTerminatorIndex(text, from) {
  let index = from;
  while (index < text.length && !LINE_TERMINATOR.test(text[index])) index += 1;
  return index;
}

function whitespaceEnd(text, from) {
  let index = from;
  while (index < text.length && WHITESPACE.test(text[index])) index += 1;
  return index;
}

/**
 * Drops `//` comment lines, together with any blank lines before them, in one
 * linear pass: the same text `/^\s*\/\/.*$/gm` removes, without its backtracking.
 */
function withoutLineComments(text) {
  let kept = '';
  let copied = 0;
  for (let lineStart = 0; lineStart <= text.length;) {
    const contentStart = whitespaceEnd(text, lineStart);
    const lineEnd = lineTerminatorIndex(text, contentStart);
    if (text.startsWith('//', contentStart)) {
      kept += text.slice(copied, lineStart);
      copied = lineEnd;
    }
    lineStart = lineEnd + 1;
  }
  return kept + text.slice(copied);
}

export function withoutComments(source) {
  return withoutLineComments(source.replace(/\/\*[\s\S]*?\*\//g, ''));
}

/** A class that applies only on the website's surfaces keeps the website's names. */
export const withoutWebsiteVariants = (text) =>
  text.replaceAll(/\[\[data-public-surface\]_&\]:[^\s'"`]+/g, '');

/**
 * Colour rules for product UI classes: colours come from the theme's tokens,
 * so both themes repaint them. Shape, type, spacing, shadow and motion are the
 * owner's call per screen and are not policed (owner, 2026-11-20).
 */
const PRODUCT_UI_CLASS_RULES = [
  {
    test: (classes) => /(?<![\w-])(?:[\w-]+:)*text-subtle(?![\w-])/.test(classes),
    message: 'the subtle ink is retired; labels and meta use muted',
  },
  {
    test: (classes) =>
      /\b(?:bg|text|border|ring)-(?:gray|indigo|cyan|coral|lime|amber)-\d+\b/.test(classes),
    message: 'product UI must consume semantic colour roles',
  },
];

export function productUiSourceViolations(source, label, ownsProductUi) {
  if (!ownsProductUi || !label.endsWith('.tsx')) return [];
  return jsxClassData(source, label).flatMap((entry) =>
    PRODUCT_UI_CLASS_RULES.filter((rule) => rule.test(entry.classes)).map(
      (rule) => `${label}:${entry.line}: ${rule.message}`,
    ),
  );
}

/** Product controls must route behavior through shared owners. */
const RAW_PRODUCT_CONTROL_MESSAGES = new Map([
  ['select', 'native select must use components/ui/select'],
  ['input', 'raw product input must use a components/ui owner'],
  ['textarea', 'raw product textarea must use components/ui/textarea'],
  ['button', 'raw product button must use Button or Pressable'],
]);

export function productControlViolations(source, label, ownsProductUi) {
  if (!ownsProductUi || !label.endsWith('.tsx') || label.startsWith('components/ui/')) return [];
  const program = parseSource(source, label);
  const lineOf = lineIndex(source);
  const violations = [];
  walk(program, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    const message = RAW_PRODUCT_CONTROL_MESSAGES.get(nameText(node.name));
    if (message) violations.push(`${label}:${lineOf(node.start)}: ${message}`);
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
 * `--color-ink-secondary` / `--color-ink-muted` / `--color-accent-ink` (TEXT
 * inks) silently yield usable `bg-*` utilities. A text-ink background once
 * painted the page-kind score expansion as a dark slate panel with unreadable
 * controls on it, and neither review nor the type system could catch it.
 *
 * The check lives here because it is a design-token contract, and this file
 * already owns the others. It walks the AST rather than matching source text:
 * it reads string and template text only, so the rule cannot be tripped by a
 * prose mention in a comment.
 *
 * NOT banned: `bg-ink` + `text-on-ink` is the inverse-chip pattern (an ink
 * badge, the calendar's selected day).
 */
const TEXT_ROLE_BACKGROUND = new RegExp(
  // Assembled from fragments so this policy source -- which the walk in
  // check-design-system.mjs also reads -- can never match itself.
  String.raw`(^|\s)${['bg', '-'].join('')}(ink-2|ink-secondary|ink-muted|accent-ink|accent-text|subtle|secondary|muted)(\s|/|$)`,
);

const TEXT_ROLE_BACKGROUND_MESSAGE =
  'background utility built from a TEXT-role token; use a surface token ' +
  '(bg-ground, bg-surface, bg-well, bg-raised, bg-ink) or a semantic bg-*-wash';

/** Surfaces must never be painted with a text-ink token. */

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

/**
 * The app's Tailwind scans only the `@source` directories in app.css, so a
 * class used only in an unlisted directory is silently never generated: the
 * element renders unstyled. Every component directory that listed code
 * imports must itself be listed. `files` are `{ label, source }` with labels
 * relative to frontend/.
 */
export function appSourceViolations(appCss, files) {
  const listed = [...appCss.matchAll(/@source\s+'\.\.\/\.\.\/\.\.\/([^']+)'/g)].map(([, path]) =>
    path.replace(/\/$/, ''),
  );
  const covered = (label) => listed.some((path) => label === path || label.startsWith(`${path}/`));
  const missing = new Map();
  for (const { label, source } of files) {
    if (!covered(label)) continue;
    for (const [, name] of source.matchAll(/(?:from |import\()'@\/components\/([\w-]+)\//g)) {
      const directory = `components/${name}`;
      if (!covered(directory) && !missing.has(directory)) missing.set(directory, label);
    }
  }
  return [...missing].map(
    ([directory, label]) =>
      `apps/app/src/app.css: ${directory} (imported by ${label}) is missing from @source, so its classes are never generated`,
  );
}
