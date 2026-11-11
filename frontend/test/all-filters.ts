import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

/**
 * Opens All filters and returns one filter's row, named with its value
 * ("Topic: All topics"), as a reader finds it.
 */
export async function openFilterRow(user: User, label: string, value?: string) {
  await user.click(screen.getByRole('button', { name: /^All filters/ }));
  return screen.findByRole('menuitem', {
    name: value ? `${label}: ${value}` : new RegExp(`^${label}:`),
  });
}

/** Opens one filter's submenu from All filters, with the keyboard. */
export async function openFilterOptions(user: User, label: string, value?: string) {
  const row = await openFilterRow(user, label, value);
  row.focus();
  await user.keyboard('{ArrowRight}');
}

/** Opens a filter's submenu and activates one of its items (a radio, a check or an action). */
export async function chooseFilterOption(
  user: User,
  label: string,
  choice: string | RegExp,
  role: 'menuitemradio' | 'menuitemcheckbox' | 'menuitem' = 'menuitemradio',
) {
  await openFilterOptions(user, label);
  (await screen.findByRole(role, { name: choice })).focus();
  await user.keyboard('{Enter}');
}
