import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import { authApi } from '@/lib/api/auth';
import { hasSignupTermsConsent } from '@/lib/auth/terms-consent';
import { renderWithProviders } from '@/test/render';

import { LoginScreen } from './login-screen';
import { RegisterScreen } from './register-screen';

const noParams = new URLSearchParams();
const PUBLISHED = { terms_revision: '2026-09-24', privacy_notice_revision: '2026-09-24' };

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

    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument();
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

  it('signs in without asking for the Terms again', async () => {
    const login = vi.spyOn(authApi, 'login').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('reader@example.com', 'correct horse'));
    login.mockRestore();
  });

  it('takes the Terms decision before an account is created', async () => {
    window.sessionStorage.clear();
    const policies = vi.spyOn(authApi, 'policies').mockResolvedValue(PUBLISHED);
    const registerAccount = vi.spyOn(authApi, 'register').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.type(screen.getByLabelText(/^Confirm password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Agree to the Terms of Service');
    expect(registerAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms of Service' }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(registerAccount).toHaveBeenCalledWith({
        email: 'reader@example.com',
        password: 'correct horse battery',
        termsRevision: '2026-09-24',
        returnTo: undefined,
      }),
    );
    expect(hasSignupTermsConsent()).toBe(true);
    registerAccount.mockRestore();
    policies.mockRestore();
  });

  it('takes the same Terms decision before a Google sign-up starts', async () => {
    window.sessionStorage.clear();
    const policies = vi.spyOn(authApi, 'policies').mockResolvedValue(PUBLISHED);
    const oauthStart = vi.spyOn(authApi, 'oauthStart').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    const google = screen.getByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);
    expect(await screen.findByRole('alert')).toHaveTextContent('Agree to the Terms of Service');
    expect(oauthStart).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms of Service' }));
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(oauthStart).toHaveBeenCalledWith('google', {
        returnTo: undefined,
        signupTermsRevision: '2026-09-24',
      }),
    );
    expect(hasSignupTermsConsent()).toBe(true);
    oauthStart.mockRestore();
    policies.mockRestore();
  });

  it('starts Google from sign-in without a Terms decision, so it cannot create an account', async () => {
    const oauthStart = vi.spyOn(authApi, 'oauthStart').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(oauthStart).toHaveBeenCalledWith('google', {
        returnTo: undefined,
        signupTermsRevision: undefined,
      }),
    );
    oauthStart.mockRestore();
  });

  it('prefills a Google address that has no account and says so', async () => {
    const policies = vi.spyOn(authApi, 'policies').mockResolvedValue(PUBLISHED);
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
    expect(
      screen.getByRole('checkbox', { name: 'I agree to the Terms of Service' }),
    ).not.toBeChecked();
    policies.mockRestore();
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
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
