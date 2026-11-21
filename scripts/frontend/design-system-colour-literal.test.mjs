import assert from 'node:assert/strict';
import { test } from 'node:test';

import { literalColourViolations } from '../../frontend/scripts/design-system-source-checks.mjs';

const label = 'components/example/view.tsx';
const check = (source, file = label) => literalColourViolations(source, file).length;

test('a colour literal in a JSX class or inline style skips the theme', () => {
  assert.equal(check('const a = <p className="text-[rgb(0,0,0)]" />;'), 1);
  assert.equal(check('const a = <p className="hover:bg-[#123456]" />;'), 1);
  assert.equal(check("const a = <p style={{ color: 'rgb(0,0,0)' }} />;"), 1);
  assert.equal(check('const a = <p style={{ color: `oklch(50% 0 0)` }} />;'), 1);
  assert.equal(
    check('const a = <p className="text-ink bg-[var(--color-well)] rounded-[7px]" />;'),
    0,
  );
  assert.equal(check("const a = <p style={{ color: 'var(--color-ink)', width: '13px' }} />;"), 0);
  assert.equal(
    check('const a = <p className="text-[#000]" />;', 'components/example/view.test.tsx'),
    0,
  );
});
