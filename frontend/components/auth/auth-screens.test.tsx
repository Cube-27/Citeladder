import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { authApi } from '@/lib/api/auth';
import { renderWithProviders } from '@/test/render';

import { LoginScreen } from './login-screen';
import { RegisterScreen } from './register-screen';

const noParams = new URLSearchParams();
const PUBLISHED = { terms_revision: '2026-09-24', privacy_notice_revision: '2026-09-24' };
const TERMS_BOX = { name: 'I agree to the Terms of Service' };

beforeEach(() => {
  vi.spyOn(authApi, 'policies').mockResolvedValue(PUBLISHED);
});
afterEach(() => vi.restoreAllMocks());

describe('account entry', () => {
  it('guides an existing account to credential-authorized Google linking', () => {
    renderWithProviders(
      <LoginScreen
        demoMode={false}
        signupOpen
        searchParams={new URLSearchParams({ error: 'oauth_signin_link_required' })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('connect Google from Account security');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('says why a session ended when the Terms changed', () => {
    renderWithProviders(
      <LoginScreen
        demoMode={false}
        signupOpen
        searchParams={new URLSearchParams({ error: 'terms_changed' })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Our Terms of Service changed. Agree to them to sign in again.',
    );
  });

  it('keeps email and existing Google sign-in while hiding sign-up', () => {
    renderWithProviders(
      <LoginScreen demoMode={false} signupOpen={false} searchParams={noParams} />,
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('offers sign-up while preserving the authentication continuation', () => {
    const returnTo = '/invitations/accept?token=invite-token';
    renderWithProviders(
      <LoginScreen
        demoMode={false}
        signupOpen
        searchParams={new URLSearchParams({ return_to: returnTo })}
      />,
    );

    const destination = new URL(
      screen.getByRole('link', { name: 'Sign up' }).getAttribute('href')!,
      'https://app.example.com',
    );
    expect(destination.pathname).toBe('/register');
    expect(destination.searchParams.get('return_to')).toBe(returnTo);
  });

  it('keeps registration unavailable in the temporary demo', () => {
    renderWithProviders(<LoginScreen demoMode signupOpen searchParams={noParams} />);
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('holds every way to sign in until the Terms box is ticked, then sends the decision', async () => {
    const login = vi.spyOn(authApi, 'login').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    const box = await screen.findByRole('checkbox', TERMS_BOX);
    expect(box).not.toBeChecked();
    const email = screen.getByRole('button', { name: 'Continue' });
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    for (const way of [email, google]) {
      expect(way).toBeDisabled();
      expect(way).toHaveAccessibleDescription('Agree to the Terms of Service to continue.');
    }

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse');
    await user.click(box);
    for (const way of [email, google]) {
      expect(way).toBeEnabled();
      expect(way).toHaveAccessibleDescription('');
    }
    await user.click(email);

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: 'reader@example.com',
        password: 'correct horse',
        termsRevision: '2026-09-24',
      }),
    );
  });

  it('starts Google from sign-in with the Terms decision, as a sign-in that cannot create an account', async () => {
    const oauthStart = vi.spyOn(authApi, 'oauthStart').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    await user.click(await screen.findByRole('checkbox', TERMS_BOX));
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(oauthStart).toHaveBeenCalledWith('google', {
        returnTo: undefined,
        termsRevision: '2026-09-24',
        signup: false,
      }),
    );
  });

  it('holds account creation until the Terms box is ticked, then sends the decision', async () => {
    const registerAccount = vi.spyOn(authApi, 'register').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.type(screen.getByLabelText(/^Confirm password/), 'correct horse battery');
    const create = screen.getByRole('button', { name: 'Create account' });
    expect(create).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', TERMS_BOX));
    await user.click(create);

    await waitFor(() =>
      expect(registerAccount).toHaveBeenCalledWith({
        email: 'reader@example.com',
        password: 'correct horse battery',
        termsRevision: '2026-09-24',
        returnTo: undefined,
      }),
    );
  });

  it('starts a Google sign-up with the same Terms decision', async () => {
    const oauthStart = vi.spyOn(authApi, 'oauthStart').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    await user.click(screen.getByRole('checkbox', TERMS_BOX));
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);

    await waitFor(() =>
      expect(oauthStart).toHaveBeenCalledWith('google', {
        returnTo: undefined,
        termsRevision: '2026-09-24',
        signup: true,
      }),
    );
  });

  it('prefills a Google address that has no account and says so', () => {
    renderWithProviders(
      <RegisterScreen
        demoMode={false}
        signupOpen
        replace={vi.fn()}
        searchParams={
          new URLSearchParams({ error: 'oauth_signin_no_account', email: 'new@gmail.com' })
        }
      />,
    );

    expect(screen.getByLabelText(/^Email address/)).toHaveValue('new@gmail.com');
    expect(screen.getByText(/No account uses that Google address/)).toBeVisible();
    expect(screen.getByRole('checkbox', TERMS_BOX)).not.toBeChecked();
  });

  it('shows no registration form on a direct visit to the sign-up page', () => {
    renderWithProviders(
      <RegisterScreen
        demoMode={false}
        signupOpen={false}
        replace={vi.fn()}
        searchParams={noParams}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Registration unavailable' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
