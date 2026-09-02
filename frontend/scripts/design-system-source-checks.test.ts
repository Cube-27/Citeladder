import { describe, expect, it } from 'vitest';

import {
  rawRadiusViolations,
  directRadixImportViolations,
  editorialTypographyViolations,
  nestedCardViolations,
  productUiSourceViolations,
  productControlViolations,
  standalonePlaceholderViolations,
  textRoleBackgroundViolations,
} from './design-system-source-checks.mjs';

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
