import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  rawRadiusViolations,
  directRadixImportViolations,
  editorialTypographyViolations,
  nestedCardViolations,
  productUiSourceViolations,
  productControlViolations,
  standalonePlaceholderViolations,
  textRoleBackgroundViolations,
  websiteContractViolations,
} from './design-system-source-checks.mjs';

const NEWLINE = String.fromCharCode(10);
const tempRoots: string[] = [];
afterEach(() => {
  for (const directory of tempRoots.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

const ROLES = [
  ['[data-flow-surface]', ''],
  ['.flow-actions.safe-bottom', ''],
  ['.website-hero-display', 'font-size: 2.75rem;'],
  ['.website-page-title', 'font-size: 2.5rem;'],
  ['.website-section-heading', ''],
  ['.website-feature-heading', ''],
  ['.website-small-heading', ''],
  ['.flow-title', 'font-size: 1.75rem;'],
  ['.flow-group-title', 'font-size: 1.0625rem;'],
  ['.flow-help', 'font-size: 0.9375rem;'],
  ['.flow-meta', 'font-size: 0.875rem;'],
  ['.website-lead', 'font-size: 1.25rem;'],
  ['.website-body', 'font-size: 1rem;'],
  ['.website-nav', ''],
  ['.website-label', ''],
  ['.website-eyebrow', ''],
  ['.website-data-display', ''],
] as const;

/** A website stylesheet that satisfies every role contract, for edits per test. */
function websiteRoot(mutate: (css: string) => string = (css) => css) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'citeladder-website-contract-'));
  tempRoots.push(directory);
  const css = ROLES.map(
    ([selector, extra]) => `${selector} {
  color: var(--color-foreground);
  ${extra}
}`,
  ).join('\n');
  fs.mkdirSync(path.join(directory, 'app'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'app', 'website-type.css'), mutate(css));
  for (const [label] of JSX_FIXTURES) {
    const file = path.join(directory, ...label.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSX_FIXTURES.get(label) as string);
  }
  return directory;
}

const JSX_FIXTURES = new Map([
  ['components/marketing/landing/hero.tsx', '<h1 className="website-hero-display">t</h1>;'],
  ['components/marketing/primitives/page-hero.tsx', '<h1 className="website-page-title">t</h1>;'],
  [
    'components/marketing/primitives/section.tsx',
    '<><h2 className="website-section-heading">a</h2><h3 className="website-feature-heading">b</h3></>;',
  ],
  [
    'components/auth/auth-form.tsx',
    '<><h1 className="flow-title">a</h1><p className="website-body">b</p></>;',
  ],
  [
    'components/auth/flow-shell.tsx',
    '<><h2 className="flow-group-title">a</h2><p className="flow-help">b</p><p className="flow-meta">c</p></>;',
  ],
]);

describe('standalonePlaceholderViolations', () => {
  it('rejects quoted and JSX em-dash placeholders in product UI', () => {
    expect(
      standalonePlaceholderViolations("const value = '—';", 'lib/value.ts', true),
    ).toHaveLength(1);
    expect(
      standalonePlaceholderViolations('<span>—</span>', 'components/value.tsx', true),
    ).toHaveLength(1);
    expect(
      standalonePlaceholderViolations('const value = `—`;', 'lib/value.ts', true),
    ).toHaveLength(1);
  });

  it('allows semantic labels, prose punctuation, and excluded surfaces', () => {
    expect(
      standalonePlaceholderViolations("const value = 'Not measured';", 'lib/value.ts', true),
    ).toEqual([]);
    expect(
      standalonePlaceholderViolations(
        "const sentence = 'Evidence — with context.';",
        'components/value.tsx',
        true,
      ),
    ).toEqual([]);
    expect(
      standalonePlaceholderViolations(
        "const preview = '—';",
        'components/marketing/demo.tsx',
        false,
      ),
    ).toEqual([]);
  });
});

describe('directRadixImportViolations', () => {
  it('allows Radix only inside shared UI owners', () => {
    const radixModule = ['@radix-ui', 'react-tabs'].join('/');
    const source = `import * as Tabs from '${radixModule}';`;
    expect(directRadixImportViolations(source, 'components/feature/tabs.tsx')).toHaveLength(1);
    expect(directRadixImportViolations(source, 'components/ui/tabs.tsx')).toEqual([]);
  });
});

describe('productControlViolations', () => {
  it('rejects native controls and cosmetic Button overrides', () => {
    const source = `
      <select><option>One</option></select>
      <input aria-label="Name" />
      <textarea aria-label="Notes" />
      <button type="button">Open</button>
      <Button className="rounded-full bg-panel text-muted shadow-sm">Save</Button>
    `;
    expect(productControlViolations(source, 'components/example.tsx', true)).toHaveLength(5);
  });

  it('allows shared controls and semantic Button layout classes', () => {
    const source = `
      <Select ariaLabel="Status" options={options} />
      <Pressable className="grid w-full gap-2">Open</Pressable>
      <Button variant="secondary" className="w-full justify-start">Save</Button>
    `;
    expect(productControlViolations(source, 'components/example.tsx', true)).toEqual([]);
  });
});

describe('productUiSourceViolations', () => {
  it('rejects arbitrary product type and raw large spacing', () => {
    const source = '<div className="text-[13px] gap-6 p-5">Example</div>';
    expect(productUiSourceViolations(source, 'components/example.tsx', true)).toHaveLength(2);
  });

  it('allows the even ladder and semantic spacing roles', () => {
    const source =
      '<div className="text-sm gap-[var(--workspace-gap)] p-[var(--card-padding)]">Example</div>';
    expect(productUiSourceViolations(source, 'components/example.tsx', true)).toEqual([]);
  });

  it('rejects retired product typography, palette utilities, and feature elevation', () => {
    const source =
      '<div className="text-2xs font-semibold bg-indigo-500 shadow-card">Example</div>';
    // Retired size, retired weight, raw palette, feature elevation — and the
    // weight is also a call-site weight decision, which is its own violation.
    expect(productUiSourceViolations(source, 'components/example.tsx', true)).toHaveLength(4);
  });

  it('rejects a font weight chosen at a call site', () => {
    const source = '<span className="text-sm font-medium">Example</span>';
    expect(productUiSourceViolations(source, 'components/example.tsx', true)).toHaveLength(1);
  });

  it('lets components/ui own font weight, since the roles live there', () => {
    const source = '<span className="text-sm font-medium">Example</span>';
    expect(productUiSourceViolations(source, 'components/ui/example.tsx', true)).toEqual([]);
  });

  it('rejects a bordered filled box that should be a Panel', () => {
    const source =
      '<div className="bg-well border-border-subtle rounded-[var(--radius-control)] border p-3">x</div>';
    expect(productUiSourceViolations(source, 'components/example.tsx', true)).toHaveLength(1);
  });

  it('leaves chips and icon tiles alone — a Panel needs an all-sides padding', () => {
    const source =
      '<span className="bg-well border-border-subtle rounded-[var(--radius-control)] border px-2 py-0.5">x</span>';
    expect(productUiSourceViolations(source, 'components/example.tsx', true)).toEqual([]);
  });

  it('does not read a prose renderer’s descendant selectors as a Panel', () => {
    const source =
      '<div className="[&_pre]:bg-well [&_pre]:border [&_pre]:rounded-[var(--radius-control)] [&_pre]:p-4">x</div>';
    expect(productUiSourceViolations(source, 'lib/content/example.tsx', true)).toEqual([]);
  });

  it('rejects a child that sets its own vertical rhythm', () => {
    const source = '<p className="mt-3">Example</p>';
    expect(productUiSourceViolations(source, 'components/example.tsx', true)).toHaveLength(1);
  });

  it('allows a 2px nudge, a sized glyph, and a negative margin', () => {
    const cases = [
      '<p className="mt-0.5">x</p>',
      '<Icon className="mt-1.5 size-4" />',
      '<div className="-mt-2">x</div>',
    ];
    for (const source of cases) {
      expect(productUiSourceViolations(source, 'components/example.tsx', true)).toEqual([]);
    }
  });
});

describe('Radius ladder', () => {
  it('rejects a size-named radius on any surface, marketing included', () => {
    const source = '<div className="rounded-lg">x</div>';
    expect(rawRadiusViolations(source, 'components/marketing/example.tsx')).toHaveLength(1);
    expect(rawRadiusViolations(source, 'components/example.tsx')).toHaveLength(1);
  });

  it('rejects a bare rounded and a directional size name', () => {
    expect(
      rawRadiusViolations('<div className="rounded">x</div>', 'components/a.tsx'),
    ).toHaveLength(1);
    expect(
      rawRadiusViolations('<div className="rounded-t-md">x</div>', 'components/a.tsx'),
    ).toHaveLength(1);
  });

  it('allows the role tokens, the micro rung, and the pill', () => {
    const source = '<div className="rounded-[var(--radius-card)] rounded-xs rounded-full">x</div>';
    expect(rawRadiusViolations(source, 'components/example.tsx')).toEqual([]);
  });

  it('rejects website typography inside product UI', () => {
    const source = '<h1 className="website-feature-heading">Example</h1>';
    expect(
      productUiSourceViolations(source, 'components/onboarding/example.tsx', true),
    ).toHaveLength(1);
  });

  it('allows the onboarding flow to use the website editorial ladder', () => {
    const source = '<h1 className="flow-title">Confirm</h1>';
    expect(productUiSourceViolations(source, 'components/onboarding/example.tsx', false)).toEqual(
      [],
    );
    expect(
      editorialTypographyViolations(source, 'components/onboarding/example.tsx', true),
    ).toEqual([]);
  });
});

describe('nestedCardViolations', () => {
  it('rejects nested semantic cards and allows sibling cards', () => {
    expect(
      nestedCardViolations('<Card><div><Card /></div></Card>', 'components/example.tsx', true),
    ).toHaveLength(1);
    expect(nestedCardViolations('<><Card /><Card /></>', 'components/example.tsx', true)).toEqual(
      [],
    );
  });
});

describe('textRoleBackgroundViolations', () => {
  // Assembled at runtime so this spec -- which the policy walk in
  // check-design-system.mjs also reads -- cannot trip its own rule.
  const banned = (role: string) => ['bg', '-'].join('') + role;

  it('rejects text-ink backgrounds in string, template, and JSX class text', () => {
    expect(
      textRoleBackgroundViolations(`const c = 'rounded ${banned('subtle')} p-2';`, 'lib/x.ts'),
    ).toHaveLength(1);
    expect(
      textRoleBackgroundViolations(`const c = \`flex ${banned('muted')} \${id}\`;`, 'lib/x.ts'),
    ).toHaveLength(1);
    expect(
      textRoleBackgroundViolations(
        `<div className="${banned('secondary')}" />`,
        'components/x.tsx',
      ),
    ).toHaveLength(1);
    expect(
      textRoleBackgroundViolations(`const c = '${banned('subtle')}/70';`, 'lib/x.ts'),
    ).toHaveLength(1);
  });

  it('allows surface tokens, prefixed variants, prose, and non-source files', () => {
    expect(textRoleBackgroundViolations("const c = 'flex bg-panel';", 'lib/x.ts')).toEqual([]);
    // A variant prefix is a different utility; the ESLint selector this
    // replaced anchored on a word boundary too.
    expect(
      textRoleBackgroundViolations(`const c = 'hover:${banned('subtle')}';`, 'lib/x.ts'),
    ).toEqual([]);
    expect(
      textRoleBackgroundViolations(`// never paint with ${banned('subtle')}`, 'lib/x.ts'),
    ).toEqual([]);
    expect(textRoleBackgroundViolations(banned('subtle'), 'app/globals.css')).toEqual([]);
  });
});

describe('websiteContractViolations', () => {
  const withRole = (css: string, selector: string, color: string) =>
    css.replace(
      [selector, ' {', NEWLINE, '  color: var(--color-foreground);'].join(''),
      [selector, ' {', NEWLINE, '  color: ', color, ';'].join(''),
    );

  it('accepts a retuned type scale and a role moved to another token', () => {
    // The design system is allowed to change: a bigger hero and a role that
    // switches token are decisions, not regressions.
    const root = websiteRoot((css) =>
      withRole(
        css
          .replace('font-size: 2.75rem;', 'font-size: 3.5rem;')
          .replace('font-size: 1.25rem;', 'font-size: 1.3rem;'),
        '.website-label',
        'var(--color-muted)',
      ),
    );
    expect(websiteContractViolations(root)).toEqual([]);
  });

  it('rejects a role that resolves its color to a literal', () => {
    // Split so this fixture is not itself a raw color in the source scan.
    const literal = ['#33', '4155'].join('');
    const root = websiteRoot((css) => withRole(css, '.website-lead', literal));
    expect(websiteContractViolations(root)).toEqual([
      expect.stringContaining('.website-lead must take its color from a token'),
    ]);
  });

  it('rejects a role that disappears', () => {
    const root = websiteRoot((css) => css.replace('.website-eyebrow {', '.website-eyebrow-x {'));
    // A renamed role is both absent and uncolored, so it reports on both counts.
    expect(websiteContractViolations(root)).toContainEqual(
      expect.stringContaining('missing website selector .website-eyebrow'),
    );
  });

  it('rejects an inverted type ladder', () => {
    const root = websiteRoot((css) => css.replace('font-size: 2.75rem;', 'font-size: 1rem;'));
    expect(websiteContractViolations(root)).toEqual([
      expect.stringContaining('must not be larger than .website-hero-display'),
    ]);
  });
});
