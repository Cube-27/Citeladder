import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

// next/navigation is not available in jsdom — stub the router so we can assert
// on the post-success redirect (mirrors the login page test). `searchParams` is
// mutable so a test can stage an MCP `return_to` handoff.
const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

import RegisterPage from './page';

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  replace.mockReset();
  searchParams = new URLSearchParams();
});
afterAll(() => mswServer.close());

describe('RegisterPage', () => {
  it('renders sign-up options including Google and email fields', () => {
    renderWithProviders(<RegisterPage />);

    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByText(/^or$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Confirm password' })).toBeInTheDocument();
  });

  it('shows validation errors and does not call the API on empty submit', async () => {
    const user = userEvent.setup();
    const registerHandler = vi.fn();
    mswServer.use(
      http.post('/api/v1/auth/register', () => {
        registerHandler();
        return HttpResponse.json({ message: 'If eligible, sign in.' }, { status: 202 });
      }),
    );

    renderWithProviders(<RegisterPage />);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm your password/i)).toBeInTheDocument();
    expect(registerHandler).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects to sign in after the generic registration acknowledgement', async () => {
    const user = userEvent.setup();
    mswServer.use(
      http.post('/api/v1/auth/register', () =>
        HttpResponse.json({ message: 'If eligible, sign in.' }, { status: 202 }),
      ),
    );
    renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'password123');
    await user.type(screen.getByLabelText(/^confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?registered=1'));
  });

  // An MCP handoff for a visitor with no account routes /login → /register →
  // /login → consent. Registration is the middle leg: dropping `return_to`
  // here strands the connection with no way back and no explanation.
  it('carries an MCP return path through registration and back to sign-in', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({
      return_to: '/mcp/oauth/consent?transaction=abc123',
    });
    mswServer.use(
      http.post('/api/v1/auth/register', () =>
        HttpResponse.json({ message: 'If eligible, sign in.' }, { status: 202 }),
      ),
    );
    renderWithProviders(<RegisterPage />);

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login?return_to=%2Fmcp%2Foauth%2Fconsent%3Ftransaction%3Dabc123',
    );

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'password123');
    await user.type(screen.getByLabelText(/^confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/login?registered=1&return_to=%2Fmcp%2Foauth%2Fconsent%3Ftransaction%3Dabc123',
      ),
    );
  });

  it('ignores an off-site return path', async () => {
    searchParams = new URLSearchParams({ return_to: 'https://evil.test/steal' });
    renderWithProviders(<RegisterPage />);

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
