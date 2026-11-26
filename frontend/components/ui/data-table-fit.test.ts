import { describe, expect, it } from 'vite-plus/test';

import { fitFloors, hiddenLowColumns, type FitColumn } from './data-table-fit';

const column = (floor: number, low = false): FitColumn => ({ floor, low });

describe('table fit', () => {
  it('hides low columns, the last first, only until the floors fit the frame', () => {
    const prompts = [
      column(200),
      column(112),
      column(128),
      column(112, true),
      column(96, true),
      column(80),
      column(80),
    ];
    expect(hiddenLowColumns({ columns: prompts, select: 40, frame: 848 })).toEqual([]);
    expect(hiddenLowColumns({ columns: prompts, select: 40, frame: 800 })).toEqual([4]);
    expect(hiddenLowColumns({ columns: prompts, select: 40, frame: 700 })).toEqual([3, 4]);
    expect(hiddenLowColumns({ columns: prompts, select: 40, frame: 400 })).toEqual([3, 4]);
  });

  it('fits on the rendered width of a fixed column whose content outgrows its floor', () => {
    const flexible = [true, false, false, false, false, false, false, false, false];
    const low = [false, false, true, false, false, false, true, true, true];
    const probe = [225, 83, 96, 67, 139, 118, 76, 90, 204];
    const rendered = [400, 123, 132, 67, 141, 116, 83, 83, 198];
    const floors = fitFloors({ probe, rendered, flexible });
    expect(floors).toEqual([225, 123, 132, 67, 141, 118, 83, 90, 204]);
    const fit = (floor: readonly number[]) =>
      hiddenLowColumns({
        columns: floor.map((value, index) => column(value, low[index])),
        select: 0,
        frame: 1152,
      });
    expect(fit(probe)).toEqual([]);
    expect(fit(floors)).toEqual([8]);
  });
});
