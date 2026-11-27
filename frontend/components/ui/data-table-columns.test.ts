import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DATA_TABLE_POSITIONS, positionSheet } from '../../scripts/data-table-positions.mjs';
import { columnLayout } from './data-table-columns';

describe('columnLayout', () => {
  it('hides a column and moves the end padding to the last shown one', () => {
    const { attributes, share } = columnLayout({
      columns: [
        { key: 'name', label: 'Crawler' },
        { key: 'breakdown', label: 'Breakdown' },
        { key: 'seen', label: 'Seen', kind: 'number', priority: 'low' },
      ],
      hidden: [2],
      selection: true,
    });
    expect(attributes).toEqual({
      'data-c1': 'select',
      'data-c2': 'start rest',
      'data-c3': 'start rest pad-end',
      'data-c4': 'end fixed s16 num hidden',
    });
    expect(share).toBe('50.000%');
  });

  it('reads rules the generated position sheet still holds', () => {
    const sheet = readFileSync('components/ui/generated/data-table-positions.css', 'utf8');
    expect(sheet).toBe(positionSheet());
    expect(sheet).toContain(`:nth-child(${DATA_TABLE_POSITIONS}) {`);
  });
});
