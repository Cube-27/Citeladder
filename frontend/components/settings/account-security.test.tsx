import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { renderWithProviders } from '@/test/render';
import AccountSecurity from './account-security';

const { mailbox, logout, logoutAndDisconnect, security, hardNavigate } = vi.hoisted(() => ({
  mailbox: vi.fn(),
  logout: vi.fn(),
  logoutAndDisconnect: vi.fn(),
  security: vi.fn(),
  hardNavigate: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({
  authApi: { mailbox, logout, logoutAndDisconnect, security },
  authQueries: { security: () => ({ queryKey: ['auth', 'security'], queryFn: () => security() }) },
}));
vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate }));

beforeEach(() => {
  vi.clearAllMocks();
  security.mockResolvedValue({
    email: 'member@example.test',
    email_verified: true,
    methods: ['password', 'google'],
  });
  mailbox.mockResolvedValue({ message: 'Done.' });
  logout.mockResolvedValue(undefined);
  logoutAndDisconnect.mockResolvedValue(undefined);
});

it('disconnects integrations only after the person confirms what it revokes', async () => {
  renderWithProviders(<AccountSecurity />);
  // Grouped by subject: the password sits in the Sign-in card, not a card of its own.
  expect(
    ['Sign-in', 'Sessions'].map(
      (name) => screen.getByRole('region', { name }).querySelector('h2')?.textContent,
    ),
  ).toEqual(['Sign-in', 'Sessions']);
  expect(
    within(screen.getByRole('region', { name: 'Sign-in' })).getByText('Password'),
  ).toBeVisible();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Sign out and disconnect' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(
    'It also disconnects every MCP client you connected and revokes every API key you created.',
  );
  expect(logoutAndDisconnect).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Sign out and disconnect' }));
  await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
  expect(logoutAndDisconnect).toHaveBeenCalledTimes(1);
  expect(logout).not.toHaveBeenCalled();
});

it('says in words under each field why a password change was not sent, and focuses the first', async () => {
  renderWithProviders(<AccountSecurity />);
  const user = userEvent.setup();
  const current = await screen.findByLabelText(/^Current password/u, { selector: 'input' });
  const next = screen.getByLabelText(/^New password/u, { selector: 'input' });
  await user.type(next, 'abc');
  await user.click(screen.getByRole('button', { name: 'Change password and sign out' }));
  await waitFor(() => expect(current).toHaveFocus());
  expect(current).toHaveAttribute('aria-invalid', 'true');
  expect(current).toHaveAccessibleDescription('Enter your current password.');
  expect(next).toHaveAccessibleDescription('Use at least 8 characters.');
  expect(mailbox).not.toHaveBeenCalled();

  // Once both are valid the change is sent; a rejection is said under Current password.
  mailbox.mockRejectedValueOnce(new Error('Current password is incorrect.'));
  await user.type(current, 'wrong-password');
  await user.type(next, 'defghijk');
  await user.click(screen.getByRole('button', { name: 'Change password and sign out' }));
  await waitFor(() =>
    expect(current).toHaveAccessibleDescription('Current password is incorrect.'),
  );
  expect(next).not.toHaveAttribute('aria-invalid');
  expect(mailbox).toHaveBeenCalledWith('change-password', {
    current_password: 'wrong-password',
    password: 'abcdefghijk',
  });
  expect(hardNavigate).not.toHaveBeenCalled();
});

it.each(['change-password', 'sign-out'] as const)(
  'sends credentials only for a password change when performing %s',
  async (operation) => {
    renderWithProviders(<AccountSecurity />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText(/^Current password/u, { selector: 'input' }),
      'current-password',
    );
    await user.type(screen.getByLabelText(/^New password/u, { selector: 'input' }), 'new-password');
    if (operation === 'sign-out') {
      await user.click(screen.getByRole('button', { name: 'Sign out all sessions' }));
      await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
      await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
      expect(mailbox).not.toHaveBeenCalled();
      expect(logoutAndDisconnect).not.toHaveBeenCalled();
    } else {
      await user.click(screen.getByRole('button', { name: 'Change password and sign out' }));
      await waitFor(() =>
        expect(mailbox).toHaveBeenCalledWith('change-password', {
          current_password: 'current-password',
          password: 'new-password',
        }),
      );
    }
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
  },
);
