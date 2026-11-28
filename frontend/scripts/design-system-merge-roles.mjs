import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import postcss from 'postcss';

const THEME_SHEETS = [
  'apps/app/src/tokens-roles.css',
  'apps/app/src/app-type.css',
  'apps/marketing/src/site-type.css',
];
export const MERGE_ROLES_FILE = 'lib/merge-roles.gen.ts';
const GROUPS = [
  ['radius', /^--radius-/],
  ['spacing', /^--spacing-/],
  ['container', /^--container-/],
  ['ease', /^--ease-/],
  ['duration', /^--transition-duration-/],
  ['transition', /^--transition-property-/],
  ['opacity', /^--opacity-/],
  ['z', /^--z-index-/],
  ['gridCols', /^--grid-template-columns-/],
  ['fontWeight', /^--font-weight-/],
  ['fontFamily', /^--font-(?!weight-)/],
  ['fontSize', /^--text-(?!color-)/],
];

export function mergeRoles(sheets) {
  const roles = Object.fromEntries(GROUPS.map(([group]) => [group, new Set()]));
  for (const css of sheets)
    postcss.parse(css).walkAtRules('theme', (theme) =>
      theme.each((decl) => {
        if (decl.type !== 'decl' || decl.prop.includes('--', 2) || decl.prop.endsWith('*')) return;
        const match = GROUPS.find(([, prefix]) => prefix.test(decl.prop));
        if (match) roles[match[0]].add(decl.prop.replace(match[1], ''));
      }),
    );
  return Object.fromEntries(Object.entries(roles).map(([group, names]) => [group, [...names]]));
}

export function renderMergeRoles(roles) {
  const body = Object.entries(roles)
    .map(([group, names]) => {
      const list = names.map((name) => `'${name}'`).join(', ');
      return `  ${group}: [${list}],`;
    })
    .join('\n');
  return `export const MERGE_ROLES = {\n${body}\n} as const;\n`;
}

const normal = (source) => source.replace(/\s+/g, '').replace(/,([\]}])/g, '$1');

export function mergeRolesFindings(root) {
  const expected = renderMergeRoles(
    mergeRoles(THEME_SHEETS.map((sheet) => readFileSync(join(root, sheet), 'utf8'))),
  );
  const current = readFileSync(join(root, MERGE_ROLES_FILE), 'utf8');
  if (normal(current) === normal(expected)) return [];
  return [`${MERGE_ROLES_FILE}: out of date with the @theme tokens; run pnpm gen:merge-roles`];
}

if (process.argv[1] === import.meta.filename) {
  const root = resolve(import.meta.dirname, '..');
  const sheets = THEME_SHEETS.map((sheet) => readFileSync(join(root, sheet), 'utf8'));
  writeFileSync(join(root, MERGE_ROLES_FILE), renderMergeRoles(mergeRoles(sheets)));
}
