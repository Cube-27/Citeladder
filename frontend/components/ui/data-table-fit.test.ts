import { describe, expect, it } from 'vite-plus/test';

import { hiddenLowColumns, tableFloor, type FitColumn } from './data-table-fit';

const flex = (floor: number): FitColumn => ({ floor, flexible: true, low: false });
const fixed = (floor: number, low = false): FitColumn => ({ floor, flexible: false, low });

describe('table fit', () => {
  it('sums the fixed floors and the select column, each flexible column at the widest flexible floor', () => {
    expect(tableFloor([flex(200), fixed(112), flex(150), fixed(80)], 40)).toBe(632);
    expect(tableFloor([fixed(112), fixed(80)], 0)).toBe(192);
  });

  it('hides low columns, the last first, only until the floors fit the frame', () => {
    // Prompts at 1280: prompt, visibility, mentions, two low figures, enabled, actions.
    const prompts = [
      flex(200),
      fixed(112),
      fixed(128),
      fixed(112, true),
      fixed(96, true),
      fixed(80),
      fixed(80),
    ];
    // 40 + 200 + 112 + 128 + 112 + 96 + 80 + 80 = 848.
    expect(hiddenLowColumns({ columns: prompts, select: 40, frame: 848 })).toEqual([]);
    expect(hiddenLowColumns({ columns: prompts, select: 40, frame: 800 })).toEqual([4]);
    expect(hiddenLowColumns({ columns: prompts, select: 40, frame: 700 })).toEqual([3, 4]);
    // With every low column gone the table still scrolls rather than hiding a priority column.
    expect(hiddenLowColumns({ columns: prompts, select: 40, frame: 400 })).toEqual([3, 4]);
  });
});
