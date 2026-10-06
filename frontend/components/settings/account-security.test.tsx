import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { renderWithProviders } from '@/test/render';
import AccountSecurity from './account-security';

const { mailbox, security, hardNavigate } = vi.hoisted(() => ({
  mailbox: vi.fn(),
  security: vi.fn(),
  hardNavigate: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({ authApi: { mailbox, security } }));
vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate }));

beforeEach(() => {
  vi.clearAllMocks();
  security.mockResolvedValue({
    email: 'member@example.test',
    email_verified: true,
    methods: ['password', 'google'],
  });
  mailbox.mockResolvedValue({ message: 'Done.' });
});

it.each(['change-password', 'logout-all'] as const)(
  'sends credentials only for a password change when performing %s',
  async (operation) => {
    renderWithProviders(<AccountSecurity />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText(/^Current password/u, { selector: 'input' }),
      'current-password',
    );
    await user.type(screen.getByLabelText(/^New password/u, { selector: 'input' }), 'new-password');
    if (operation === 'logout-all') {
      await user.click(screen.getByRole('button', { name: 'Sign out all sessions' }));
      expect(mailbox).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    } else {
      await user.click(screen.getByRole('button', { name: 'Change password and sign out' }));
    }
    await waitFor(() =>
      expect(mailbox).toHaveBeenCalledWith(
        operation,
        operation === 'change-password'
          ? { current_password: 'current-password', password: 'new-password' }
          : {},
      ),
    );
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
  },
);
