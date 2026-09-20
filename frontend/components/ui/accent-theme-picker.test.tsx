import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { AccentThemePicker } from './accent-theme-picker';

afterEach(() => {
  delete document.documentElement.dataset.accent;
  window.localStorage.removeItem('citeladder.accent');
});

describe('AccentThemePicker', () => {
  it('applies a selected accent and follows a change from another tab', async () => {
    const dispatchStorage = (key: string | null, newValue: string | null, storageArea: Storage) => {
      const event = new StorageEvent('storage', { key, newValue });
      Object.defineProperty(event, 'storageArea', { value: storageArea });
      window.dispatchEvent(event);
    };
    const user = userEvent.setup();
    render(<AccentThemePicker />);

    await user.click(screen.getByRole('button', { name: 'Accent color' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Blue' }));
    expect(document.documentElement.dataset.accent).toBe('blue');
    expect(window.localStorage.getItem('citeladder.accent')).toBe('blue');

    await user.click(screen.getByRole('button', { name: 'Accent color' }));
    expect(screen.getByRole('menuitemradio', { name: 'Blue' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    act(() => {
      dispatchStorage('citeladder.accent', 'violet', window.localStorage);
    });
    expect(document.documentElement.dataset.accent).toBe('violet');
    expect(screen.getByRole('menuitemradio', { name: 'Violet' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    act(() => {
      dispatchStorage(null, null, window.sessionStorage);
    });
    expect(document.documentElement.dataset.accent).toBe('violet');

    act(() => {
      dispatchStorage(null, null, window.localStorage);
    });
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(screen.getByRole('menuitemradio', { name: 'Emerald' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
