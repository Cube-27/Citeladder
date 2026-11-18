import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

const filterName = (label: string, value?: string) =>
  value ? `${label}: ${value}` : new RegExp(`^${label}:`);

/**
 * Finds one filter as a reader does, named with its value ("Topic: All
 * topics"): its own chip in the control row, or its row inside Filters.
 */
export async function openFilterRow(user: User, label: string, value?: string) {
  // Whichever the row draws once it loads: the filter's own chip, or Filters.
  await screen.findAllByRole('button', {
    name: (name) => name.startsWith('Filters') || name.startsWith(`${label}:`),
  });
  const own = screen.queryByRole('button', { name: filterName(label, value) });
  const all = screen.queryByRole('button', { name: /^Filters/ });
  if (own || !all) return own ?? screen.findByRole('button', { name: filterName(label, value) });
  await user.click(all);
  return screen.findByRole('menuitem', { name: filterName(label, value) });
}

/** Opens one filter's options: its submenu in Filters, or its chip's own menu. */
export async function openFilterOptions(user: User, label: string, value?: string) {
  const row = await openFilterRow(user, label, value);
  if (row.getAttribute('role') !== 'menuitem') {
    await user.click(row);
    return;
  }
  row.focus();
  await user.keyboard('{ArrowRight}');
}

/** Opens a filter's options and activates one of its items (a radio, a check or an action). */
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
