import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { AccentThemePicker } from './accent-theme-picker';

afterEach(() => {
  delete document.documentElement.dataset.accent;
  localStorage.removeItem('citeladder.accent');
});

describe('AccentThemePicker', () => {
  it('applies a selected accent and follows a change from another tab', async () => {
    const user = userEvent.setup();
    render(<AccentThemePicker />);

    await user.click(screen.getByRole('button', { name: 'Accent color' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Blue' }));
    expect(document.documentElement.dataset.accent).toBe('blue');
    expect(localStorage.getItem('citeladder.accent')).toBe('blue');

    await user.click(screen.getByRole('button', { name: 'Accent color' }));
    expect(screen.getByRole('menuitemradio', { name: 'Blue' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'citeladder.accent', newValue: 'violet' }),
      );
    });
    expect(document.documentElement.dataset.accent).toBe('violet');
    expect(screen.getByRole('menuitemradio', { name: 'Violet' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
