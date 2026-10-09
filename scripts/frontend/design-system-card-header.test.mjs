import assert from 'node:assert/strict';
import test from 'node:test';

import { cardHeaderLayoutViolations } from '../../frontend/scripts/design-system-source-checks.mjs';

const check = (source) =>
  cardHeaderLayoutViolations(source, 'components/feature/screen.tsx', true).length;

test('a card header that lays out its own row is the retired shape', () => {
  assert.equal(
    check(
      '<CardHeader className="flex-row items-center justify-between"><CardTitle /></CardHeader>',
    ),
    1,
  );
  assert.equal(check("<CardHeader className={cn('sm:flex-row', open && 'pb-0')} />"), 1);
});

test('actions, spacing tweaks and other elements pass', () => {
  assert.equal(check('<CardHeader actions={<Badge />} bordered><CardTitle /></CardHeader>'), 0);
  assert.equal(check('<CardHeader className="pb-0" />'), 0);
  assert.equal(check('<div className="flex-row justify-between" />'), 0);
});
