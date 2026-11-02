import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { renderWithProviders } from '@/test/render';

import { LoginScreen } from './login-screen';
import { RegisterScreen } from './register-screen';

const noParams = new URLSearchParams();
const PUBLISHED = { terms_revision: '2026-09-24', privacy_notice_revision: '2026-09-24' };
const TERMS_BOX = { name: 'I agree to the Terms of Service' };

// Cloudflare's widget cannot run here: a stand-in renders nothing and hands
// the form a token when the test "solves" it.
let solveChallenge: (token: string) => void = () => {};
let widgetHost: HTMLElement | null = null;
beforeEach(() => {
  vi.spyOn(authApi, 'policies').mockResolvedValue(PUBLISHED);
  vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key');
  window.turnstile = {
    render: (container, options) => {
      widgetHost = container;
      solveChallenge = (token) => act(() => options.callback(token));
      return 'widget';
    },
    reset: () => {},
    remove: () => {},
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete window.turnstile;
  widgetHost = null;
});

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

    // Sign-in is never challenged: no widget, and the request carries no token.
    expect(screen.queryByRole('group', { name: 'Verification' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: 'reader@example.com',
        password: 'correct horse',
        termsRevision: '2026-09-24',
      }),
    );
  });

  it('reads the republished Terms revision after a sign-in names a stale one', async () => {
    vi.mocked(authApi.policies)
      .mockResolvedValueOnce(PUBLISHED)
      .mockResolvedValue({ ...PUBLISHED, terms_revision: '2026-11-02' });
    const login = vi
      .spyOn(authApi, 'login')
      .mockRejectedValueOnce(
        new ApiError('The Terms changed.', 409, '', undefined, { code: 'policy_revision_changed' }),
      )
      .mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse');
    await user.click(await screen.findByRole('checkbox', TERMS_BOX));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The Terms changed.');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(login).toHaveBeenLastCalledWith({
        email: 'reader@example.com',
        password: 'correct horse',
        termsRevision: '2026-11-02',
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

  it('holds account creation until the Terms box is ticked and the check is solved, then sends both', async () => {
    const registerAccount = vi.spyOn(authApi, 'register').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.type(screen.getByLabelText(/^Confirm password/), 'correct horse battery');
    const create = screen.getByRole('button', { name: 'Create account' });
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    expect(create).toBeDisabled();
    expect(google).toBeDisabled();

    await user.click(screen.getByRole('checkbox', TERMS_BOX));
    // Terms alone is not enough: the widget has not handed over a token yet.
    await waitFor(() => expect(widgetHost).not.toBeNull());
    expect(create).toBeDisabled();
    expect(google).toBeDisabled();

    solveChallenge('solved-token');
    expect(create).toBeEnabled();
    expect(google).toBeEnabled();
    await user.click(create);

    await waitFor(() =>
      expect(registerAccount).toHaveBeenCalledWith({
        email: 'reader@example.com',
        password: 'correct horse battery',
        termsRevision: '2026-09-24',
        turnstileToken: 'solved-token',
        returnTo: undefined,
      }),
    );
  });

  it('reserves the widget slot between the Terms box and submit, so solving it moves nothing', async () => {
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    const slot = screen.getByRole('group', { name: 'Verification' });
    const terms = screen.getByRole('checkbox', TERMS_BOX);
    const create = screen.getByRole('button', { name: 'Create account' });
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect([follows(terms, slot), follows(slot, create)]).toEqual([true, true]);

    await waitFor(() => expect(widgetHost).not.toBeNull());
    expect(slot).toContainElement(widgetHost);
    const rows = [...slot.parentElement!.children];
    solveChallenge('solved-token');
    // The same reserved element holds the completed widget; nothing appeared around it.
    expect(screen.getByRole('group', { name: 'Verification' })).toBe(slot);
    expect([...slot.parentElement!.children]).toEqual(rows);
  });

  it('shows a refused disposable address under the email field, not as a form alert', async () => {
    vi.spyOn(authApi, 'register').mockRejectedValue(
      new ApiError(
        'Use a permanent email address. Disposable addresses cannot sign up.',
        422,
        '',
        undefined,
        { code: 'disposable_email_domain' },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    await user.type(screen.getByLabelText(/^Email address/), 'reader@mailinator.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.type(screen.getByLabelText(/^Confirm password/), 'correct horse battery');
    await user.click(screen.getByRole('checkbox', TERMS_BOX));
    await waitFor(() => expect(widgetHost).not.toBeNull());
    solveChallenge('solved-token');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByLabelText(/^Email address/)).toHaveAccessibleDescription(
        expect.stringContaining('Disposable addresses cannot sign up.'),
      ),
    );
    // Said once, under the field: the form's alert does not repeat it.
    expect(
      screen.getAllByText('Use a permanent email address. Disposable addresses cannot sign up.'),
    ).toHaveLength(1);
  });

  it('starts a Google sign-up with the same Terms decision and the solved token', async () => {
    const oauthStart = vi.spyOn(authApi, 'oauthStart').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    await user.click(screen.getByRole('checkbox', TERMS_BOX));
    await waitFor(() => expect(widgetHost).not.toBeNull());
    solveChallenge('solved-token');
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);

    await waitFor(() =>
      expect(oauthStart).toHaveBeenCalledWith('google', {
        returnTo: undefined,
        termsRevision: '2026-09-24',
        signup: true,
        turnstileToken: 'solved-token',
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
