import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { hardNavigate } from '@/lib/navigation/hard-navigate';

// next/navigation is not available in jsdom; the hard-navigation seam makes
// the post-login document transition directly assertable.
const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));
vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate: vi.fn() }));
const navigate = vi.mocked(hardNavigate);

import LoginPage from './page';

const sessionUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  role: 'owner',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  navigate.mockReset();
  searchParams.delete('registered');
  searchParams.delete('return_to');
  searchParams.delete('error');
});
afterAll(() => mswServer.close());

describe('LoginPage', () => {
  it('confirms successful registration before sign in', () => {
    searchParams.set('registered', '1');
    renderWithProviders(<LoginPage />);

    expect(screen.getByText(/your account is ready/i)).toBeInTheDocument();
  });

  // The Google callback is a full-page navigation, so it cannot return a JSON
  // error body — it lands back here with a coded `?error=` instead. Without
  // this the user is bounced to /login with no explanation at all.
  it('explains a failed Google sign-in from the coded redirect', () => {
    searchParams.set('error', 'oauth_signin_email_unverified');
    renderWithProviders(<LoginPage />);

    expect(screen.getByText(/has not verified that email address/i)).toBeInTheDocument();
  });

  it('still explains an unrecognized sign-in error code', () => {
    searchParams.set('error', 'something_new_from_the_backend');
    renderWithProviders(<LoginPage />);

    expect(screen.getByText(/google sign-in did not complete/i)).toBeInTheDocument();
  });

  it('renders Google sign-in and email sign-in paths with divider', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByText(/^or$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Password' })).toBeInTheDocument();
  });

  it('shows validation errors and does not call the API on empty submit', async () => {
    const user = userEvent.setup();
    const loginHandler = vi.fn();
    mswServer.use(
      http.post('/api/v1/auth/login', () => {
        loginHandler();
        return HttpResponse.json({ user: sessionUser });
      }),
    );

    renderWithProviders(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(loginHandler).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('logs in and routes to /onboarding when the workspace has no projects', async () => {
    const user = userEvent.setup();
    mswServer.use(
      http.post('/api/v1/auth/login', () => HttpResponse.json({ user: sessionUser })),
      http.get('/api/v1/projects', () => HttpResponse.json([])),
    );

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding'));
  });

  it('returns a successful MCP login to the bounded OAuth consent path', async () => {
    const user = userEvent.setup();
    searchParams.set('return_to', '/mcp/oauth/consent?transaction=demo-transaction');
    mswServer.use(http.post('/api/v1/auth/login', () => HttpResponse.json({ user: sessionUser })));

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/mcp/oauth/consent?transaction=demo-transaction'),
    );
  });

  // The first leg of an MCP handoff for a visitor who has no account yet.
  it('carries the MCP return path onto the registration link', () => {
    searchParams.set('return_to', '/mcp/oauth/consent?transaction=demo-transaction');

    renderWithProviders(<LoginPage />);

    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute(
      'href',
      '/register?return_to=%2Fmcp%2Foauth%2Fconsent%3Ftransaction%3Ddemo-transaction',
    );
  });

  it('leaves the registration link bare without a handoff', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/register');
  });

  it('ignores an external login return target', async () => {
    const user = userEvent.setup();
    searchParams.set('return_to', 'https://evil.example/steal');
    mswServer.use(
      http.post('/api/v1/auth/login', () => HttpResponse.json({ user: sessionUser })),
      http.get('/api/v1/projects', () => HttpResponse.json([])),
    );

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding'));
  });

  it('surfaces the ApiError message inline on a 401', async () => {
    const user = userEvent.setup();
    mswServer.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid email or password.' }, { status: 401 }),
      ),
    );

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
