import { screen, waitFor } from '@testing-library/react';
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
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Sign out everywhere and disconnect integrations' }),
  );
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
