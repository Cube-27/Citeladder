import { describe, expect, it } from 'vite-plus/test';

import { figureRows } from './figure-strip';

// Widths: a full main column at 1440 (1168), 1280 (1008) and 982 (734); a
// half at 1366 (563) and 982 (359); a third at 1366 (369) and 982 (234); a
// phone (358).
describe('figureRows', () => {
  it.each([
    [1, 234, [1]],
    [2, 234, [2]],
    [2, 1168, [2]],
    [3, 734, [3]],
    [3, 359, [1, 1, 1]],
    [4, 734, [4]],
    [4, 563, [2, 2]],
    [4, 234, [2, 2]],
    [5, 1008, [5]],
    [5, 734, [3, 2]],
    [5, 359, [3, 2]],
    [6, 1168, [6]],
    [6, 1008, [3, 3]],
    [6, 563, [3, 3]],
    [6, 358, [2, 2, 2]],
    [7, 1168, [4, 3]],
    [7, 563, [3, 2, 2]],
    [7, 359, [3, 2, 2]],
    [7, 234, [3, 2, 2]],
    [8, 734, [4, 4]],
    [8, 563, [3, 3, 2]],
    [8, 234, [2, 2, 2, 2]],
    [5, 234, [3, 2]],
  ])('lays %i figures in %ipx as %j', (count, width, rows) => {
    expect(figureRows(count, width)).toEqual(rows);
  });

  it('never leaves one figure alone on a row unless the strip has one or three stack', () => {
    for (let count = 2; count <= 8; count += 1) {
      for (const width of [1168, 1008, 734, 563, 369, 359, 234]) {
        const rows = figureRows(count, width);
        expect(rows.reduce((sum, size) => sum + size, 0)).toBe(count);
        if (!(count === 3 && rows.length === 3)) expect(rows).not.toContain(1);
      }
    }
  });
});
