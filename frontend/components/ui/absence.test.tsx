import { render } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { ABSENCE_STATES, absenceOf } from '@/lib/format';

import { Absence } from './absence';

describe('Absence', () => {
  it('prints every absence state as the one dash, each named apart', () => {
    const names = ABSENCE_STATES.map((state) => {
      const { container, unmount } = render(<Absence state={state} />);
      const face = container.querySelector(`[data-absence="${state}"]`);
      const shown = face?.querySelector('[aria-hidden]')?.textContent;
      const name = face?.querySelector('.sr-only')?.textContent;
      unmount();
      expect(shown).toBe('—');
      // A formatter's word for the state reads back as that state, so it prints the dash too.
      expect(absenceOf(name)).toBe(state);
      return name;
    });
    expect(new Set(names).size).toBe(ABSENCE_STATES.length);
    expect(absenceOf('12.5%')).toBeNull();
  });
});
