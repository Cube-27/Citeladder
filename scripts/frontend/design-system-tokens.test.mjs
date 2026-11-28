import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  MERGE_ROLES_FILE,
  mergeRoles,
  mergeRolesFindings,
  renderMergeRoles,
} from '../../frontend/scripts/design-system-merge-roles.mjs';
import {
  duplicateTokenFindings,
  unreadTokenFindings,
  variantAncestorFindings,
} from '../../frontend/scripts/design-system-tokens.mjs';

test('flags a token declared twice in one scope, across sheets, but not in another scope', () => {
  const findings = duplicateTokenFindings([
    {
      label: 'a.css',
      css: ':root { --gap: 4px; }\n@media (width > 1px) { :root { --gap: 8px; } }',
    },
    { label: 'b.css', css: ":root[data-theme='dark'] { --gap: 2px; }\n:root {\n  --gap: 6px;\n}" },
  ]);
  assert.deepEqual(findings, [
    'b.css:3: --gap declared again in :root (first at a.css:1); one declaration per scope',
  ]);
});

test('flags tokens and utilities nothing reads, keeping var, theme-utility and sub-property reads', () => {
  const sheets = [
    {
      label: 't.css',
      css: [
        '@theme { --container-wide: 640px; --spacing-card: 16px; --spacing-gone: 2px; --text-body: 14px; --text-body--line-height: 20px; }',
        ':root { --ramp-a: red; --ramp-b: blue; --color-x: var(--ramp-a); }',
        '@utility edge { border: 0; }',
        '@utility unused-edge { border: 0; }',
      ].join('\n'),
    },
  ];
  const sources = [
    sheets[0].css,
    '<div className="p-card text-body edge @wide:flex" style={{ color: "var(--color-x)" }} />',
  ];
  assert.deepEqual(unreadTokenFindings({ sheets, sources }), [
    't.css:1: --spacing-gone is never read; delete it',
    't.css:2: --ramp-b is never read; delete it',
    't.css:4: @utility unused-edge is never used; delete it',
  ]);
});

test("flags a primitive's variant selected from an ancestor, not from the root or the element", () => {
  const css = [
    "[data-card] button[data-button-variant='primary'] { color: red; }",
    ":root:not([data-public-surface]) [data-button-variant='primary'] { color: red; }",
    "[data-button-variant='primary'] .icon { color: red; }",
    ".cell :is([data-button-variant], [role='combobox']) { margin: 0; }",
    "[data-public-surface] .x [data-badge-variant~='soft'] { color: red; }",
  ].join('\n');
  assert.deepEqual(
    variantAncestorFindings('v.css', css).map((finding) => finding.split(':')[1]),
    ['1', '5'],
  );
});

test('generates tailwind-merge role lists from every @theme block', () => {
  const roles = mergeRoles([
    '@theme { --spacing-*: initial; --spacing-card: 16px; --text-body: 14px; --text-body--line-height: 20px; --text-color-ink: black; }',
    '@theme inline { --radius-card: 8px; --font-figure: x; --font-weight-plain: 400; --z-index-modal: 50; }',
  ]);
  assert.equal(
    renderMergeRoles(roles),
    [
      'export const MERGE_ROLES = {',
      "  radius: ['card'],",
      "  spacing: ['card'],",
      '  container: [],',
      '  ease: [],',
      '  duration: [],',
      '  transition: [],',
      '  opacity: [],',
      "  z: ['modal'],",
      '  gridCols: [],',
      "  fontWeight: ['plain'],",
      "  fontFamily: ['figure'],",
      "  fontSize: ['body'],",
      '} as const;',
      '',
    ].join('\n'),
  );
});

test('fails when the generated role lists drift from the @theme tokens', () => {
  const root = mkdtempSync(join(tmpdir(), 'merge-roles-'));
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put('apps/app/src/tokens-roles.css', '@theme { --spacing-card: 16px; }');
  put('apps/app/src/app-type.css', '@theme { --text-body: 14px; }');
  put('apps/marketing/src/site-type.css', '@theme { --text-lead: 18px; }');
  const fresh = renderMergeRoles(
    mergeRoles(['@theme { --spacing-card: 16px; --text-body: 14px; --text-lead: 18px; }']),
  );
  put(MERGE_ROLES_FILE, fresh.replace("spacing: ['card']", "spacing: [\n    'card',\n  ]"));
  assert.deepEqual(mergeRolesFindings(root), []);
  put(MERGE_ROLES_FILE, fresh.replace("'card'", "'card', 'gone'"));
  assert.deepEqual(mergeRolesFindings(root), [
    'lib/merge-roles.gen.ts: out of date with the @theme tokens; run pnpm gen:merge-roles',
  ]);
});
