import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import { authApi } from '@/lib/api/auth';
import { hasSignInTermsConsent } from '@/lib/auth/terms-consent';
import { renderWithProviders } from '@/test/render';

import { LoginScreen } from './login-screen';
import { RegisterScreen } from './register-screen';

const noParams = new URLSearchParams();

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

  it('takes the Terms decision on the sign-in form before any way in', async () => {
    window.sessionStorage.clear();
    const login = vi.spyOn(authApi, 'login').mockReturnValue(new Promise(() => {}));
    const oauthStart = vi.spyOn(authApi, 'oauthStart');
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Agree to the Terms of Service');
    expect(login).not.toHaveBeenCalled();
    expect(oauthStart).not.toHaveBeenCalled();
    expect(hasSignInTermsConsent()).toBe(false);

    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms of Service' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('reader@example.com', 'correct horse'));
    expect(hasSignInTermsConsent()).toBe(true);
    login.mockRestore();
    oauthStart.mockRestore();
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
