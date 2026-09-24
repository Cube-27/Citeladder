import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { renderWithProviders } from '@/test/render';

import { LoginScreen } from './login-screen';
import { RegisterScreen } from './register-screen';

const noParams = new URLSearchParams();

describe('account entry while self-serve sign-up is closed', () => {
  it('keeps email sign-in but offers neither Google nor sign-up', () => {
    renderWithProviders(
      <LoginScreen demoMode={false} signupOpen={false} searchParams={noParams} />,
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('offers Google and sign-up once sign-up opens', () => {
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
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
