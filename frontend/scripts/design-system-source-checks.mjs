import { lineIndex, nameText, parseSource, stringValue, walk } from './source-ast.mjs';

const COLOUR_LITERAL = /#[\da-f]{3,8}\b|(?<![\w-])(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;
const CLASS_COLOUR_LITERAL =
  /(?<![\w-])(?:[\w-]+:)*[a-z]+(?:-[a-z]+)*-\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch)\()/i;

const textOf = (node) =>
  node.type === 'TemplateElement' ? (node.value.cooked ?? node.value.raw) : stringValue(node);

/**
 * A colour written as a literal in JSX - an arbitrary class (`text-[rgb(…)]`)
 * or an inline style - skips the theme, so dark mode never repaints it.
 */
export function literalColourViolations(source, label) {
  if (!/^(?:apps|components|lib)\//.test(label) || !label.endsWith('.tsx')) return [];
  if (/\.(?:test|spec)\.tsx$/.test(label)) return [];
  const lineOf = lineIndex(source);
  const violations = [];
  walk(parseSource(source, label), (node) => {
    if (CLASS_COLOUR_LITERAL.test(textOf(node) ?? ''))
      violations.push(
        `${label}:${lineOf(node.start)}: colours come from theme tokens, not a class literal`,
      );
    if (node.type !== 'JSXAttribute' || nameText(node.name) !== 'style') return;
    let found = false;
    walk(node.value, (inner) => {
      if (COLOUR_LITERAL.test(textOf(inner) ?? '')) found = true;
    });
    if (found)
      violations.push(
        `${label}:${lineOf(node.start)}: colours come from theme tokens, not an inline style`,
      );
  });
  return violations;
}

export function directRadixImportViolations(source, label) {
  return !label.startsWith('components/ui/') && /from\s+['"]@radix-ui\//.test(source)
    ? [`${label}: feature code must use components/ui instead of importing Radix`]
    : [];
}

/**
 * The app's Tailwind scans only the `@source` directories in app.css, so a
 * class used only in an unlisted directory is never generated and the element
 * renders unstyled. Every component directory listed code imports must be
 * listed too. `files` are `{ label, source }` relative to frontend/.
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
