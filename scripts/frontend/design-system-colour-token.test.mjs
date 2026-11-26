import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  loadDesignSystem,
  undeclaredColourViolations,
} from '../../frontend/scripts/design-system-colour-tokens.mjs';

const designSystem = await loadDesignSystem(
  "@import 'tailwindcss';\n@theme { --color-*: initial; --color-ink: #000; --color-ink-2: #555; }",
  import.meta.dirname,
);
const check = (source) =>
  undeclaredColourViolations([{ label: 'components/example/view.tsx', source }], designSystem);

test('a colour class naming a token the theme never declares is reported with its line', () => {
  assert.deepEqual(check('const a = <p className="text-sm text-ink-tertiary" />;'), [
    'components/example/view.tsx:1: text-ink-tertiary is not a declared theme colour, so it draws nothing',
  ]);
  assert.deepEqual(
    check("const a = <p className={cn('hover:bg-pink-500', open && 'text-ink')} />;"),
    [
      'components/example/view.tsx:1: hover:bg-pink-500 is not a declared theme colour, so it draws nothing',
    ],
  );
  assert.deepEqual(check('const a = <p className="data-[state=open]:text-ink-tertiary" />;'), [
    'components/example/view.tsx:1: data-[state=open]:text-ink-tertiary is not a declared theme colour, so it draws nothing',
  ]);
  assert.deepEqual(
    check("const a = <p className={kind === 'text-document' ? 'text-ink' : 'text-ink-2'} />;"),
    [],
  );
  assert.deepEqual(
    check(
      'const DRAW = \'stroke-dashoffset 150ms linear\';\nconst a = <p className="text-ink-2 border-2 text-center" />;',
    ),
    [],
  );
});
