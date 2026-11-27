import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DATA_TABLE_POSITIONS,
  positionSheet,
} from '../../frontend/scripts/data-table-positions.mjs';

test('the generated data table position sheet is current', () => {
  const sheet = readFileSync(
    new URL('../../frontend/components/ui/generated/data-table-positions.css', import.meta.url),
    'utf8',
  );
  assert.equal(sheet, positionSheet(), 'run pnpm gen:table-positions');
  assert.match(sheet, new RegExp(`:nth-child\\(${DATA_TABLE_POSITIONS}\\) \\{`));
});
