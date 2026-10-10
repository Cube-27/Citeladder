import { screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { renderWithProviders } from '@/test/render';
import MailboxScreen from './mailbox-screen';

const { mailbox } = vi.hoisted(() => ({ mailbox: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ authApi: { mailbox } }));
beforeEach(() => {
  mailbox.mockReset();
  mailbox.mockResolvedValue({ message: 'Confirmed. Sign in to continue.' });
});

it('captures the token in memory and waits for an explicit password confirmation', async () => {
  const token = 'a'.repeat(43);
  window.history.replaceState(null, '', `/verify-email#token=${token}`);
  renderWithProviders(
    <StrictMode>
      <MailboxScreen />
    </StrictMode>,
    { initialEntries: ['/verify-email'] },
  );
  expect(window.location.hash).toBe('');
  expect(mailbox).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText(/Signup password/u, { selector: 'input' }),
    'chosen-password',
  );
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(mailbox).toHaveBeenCalledWith('verify-email', { token, password: 'chosen-password' }),
  );
  expect(await screen.findByText('Confirmed. Sign in to continue.')).toBeInTheDocument();
});

it('explains an incomplete link instead of asking for a password it cannot use', () => {
  window.history.replaceState(null, '', '/reset-password');
  renderWithProviders(<MailboxScreen />, { initialEntries: ['/reset-password'] });
  expect(screen.getByText(/This link is incomplete/u)).toBeVisible();
  expect(screen.queryByLabelText(/New password/u)).toBeNull();
  expect(screen.getByRole('link', { name: 'Request one' })).toHaveAttribute(
    'href',
    '/forgot-password',
  );
});
