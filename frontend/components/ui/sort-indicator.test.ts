import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { describe, expect, it } from 'vite-plus/test';

import { sortIndicator } from './sort-indicator';

const ICONS = { ascending: ArrowUp, descending: ArrowDown, inactive: ArrowUpDown };

describe('sortIndicator', () => {
  it('announces nothing and shows the neutral glyph on an inactive column', () => {
    // `descending` is deliberately true here: an inactive column has no order,
    // so the flag must not leak into either half of the answer.
    const indicator = sortIndicator(false, true, ICONS);

    expect(indicator.ariaSort).toBeUndefined();
    expect(indicator.icon).toBe(ArrowUpDown);
  });

  it('pairs the ascending announcement with the ascending glyph', () => {
    const indicator = sortIndicator(true, false, ICONS);

    expect(indicator.ariaSort).toBe('ascending');
    expect(indicator.icon).toBe(ArrowUp);
  });

  it('pairs the descending announcement with the descending glyph', () => {
    const indicator = sortIndicator(true, true, ICONS);

    expect(indicator.ariaSort).toBe('descending');
    expect(indicator.icon).toBe(ArrowDown);
  });
});
