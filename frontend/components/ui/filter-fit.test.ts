import { describe, expect, it } from 'vite-plus/test';

import { keptFilterCount } from '@/components/ui/filter-fit';

const base = { gap: 8, trailing: 0, menu: 90, menuAlways: false, values: [] };

describe('keptFilterCount', () => {
  it.each([
    ['keeps every chip while they fit', { widths: [100, 100, 100], available: 316 }, 3],
    ['folds the overflow and reserves the menu', { widths: [100, 100, 100], available: 300 }, 1],
    ['folds every chip when only the menu fits', { widths: [100, 100], available: 120 }, 0],
    ['keeps chips that have not been measured', { widths: [0, 0, 0], available: 0 }, 3],
    [
      'keeps chips in a row with no width yet',
      { widths: [0, 0], available: 0, menuAlways: true },
      2,
    ],
  ])('%s', (_name, input, kept) => {
    expect(keptFilterCount({ ...base, ...input })).toBe(kept);
  });

  it('charges a folded filter its value chip only while it stays folded', () => {
    const fit = { ...base, widths: [100, 100, 100], values: [0, 0, 100], trailing: 60 };
    expect(keptFilterCount({ ...fit, available: 384 })).toBe(3);
    expect(keptFilterCount({ ...fit, available: 383 })).toBe(1);
  });

  it('reserves an always-present menu and the trailing chips before keeping a chip', () => {
    const widths = [100, 100];
    expect(keptFilterCount({ ...base, widths, available: 208 })).toBe(2);
    expect(keptFilterCount({ ...base, widths, available: 208, menuAlways: true })).toBe(1);
    expect(
      keptFilterCount({ ...base, widths, available: 306, menuAlways: true, trailing: 60 }),
    ).toBe(1);
  });
});
