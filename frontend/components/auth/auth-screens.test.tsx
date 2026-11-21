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
const SIGN_IN_AGREEMENT =
  'By continuing, you agree to the Terms of Service and acknowledge the Privacy Policy.';
const SIGN_UP_AGREEMENT =
  'By creating an account, you agree to the Terms of Service and acknowledge the Privacy Policy.';

const held = (button: HTMLElement) => button.getAttribute('aria-disabled') === 'true';
const follows = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

let solveChallenge: (token: string) => void = () => {};
let widgetHost: HTMLElement | null = null;
let widgetSize = '';
beforeEach(() => {
  vi.spyOn(authApi, 'policies').mockResolvedValue(PUBLISHED);
  vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key');
  window.turnstile = {
    render: (container, options) => {
      widgetHost = container;
      widgetSize = options.size;
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
  widgetSize = '';
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
      'Our Terms of Service changed. Sign in again to agree to them.',
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

  it('states the Terms agreement on every way to sign in, with no box to tick, and sends the decision', async () => {
    const login = vi.spyOn(authApi, 'login').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    const email = screen.getByRole('button', { name: 'Continue' });
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(held(email)).toBe(false));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(google).toBeEnabled();
    for (const way of [email, google]) {
      expect(way).toHaveAccessibleDescription(SIGN_IN_AGREEMENT);
    }
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      expect.stringContaining('/terms'),
    );

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse');
    await user.click(email);

    expect(screen.queryByRole('group', { name: 'Verification' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: 'reader@example.com',
        password: 'correct horse',
        termsRevision: '2026-09-24',
      }),
    );
  });

  it('keeps focus on the submit while signing in and sends one attempt', async () => {
    const login = vi.spyOn(authApi, 'login').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse');
    const signIn = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => expect(held(signIn)).toBe(false));
    await user.click(signIn);

    const pending = await screen.findByRole('button', { name: 'Signing in…' });
    expect(pending).toBe(signIn);
    expect(pending).toBeEnabled();
    expect(pending).toHaveFocus();
    expect(held(pending)).toBe(true);
    await user.keyboard('{Enter}');
    await user.click(pending);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('says refused credentials under the password field, not above the form', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError('Invalid email or password', 401, ''),
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    const password = screen.getByLabelText(/^Password/);
    await user.type(password, 'wrong horse');
    const signIn = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => expect(held(signIn)).toBe(false));
    await user.click(signIn);

    const alert = await screen.findByRole('alert');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription(alert.textContent ?? '');
    expect([follows(password, alert), follows(alert, signIn)]).toEqual([true, true]);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows the check once the API challenges a sign-in, holds submit until solved, then sends the token', async () => {
    const login = vi
      .spyOn(authApi, 'login')
      .mockRejectedValueOnce(
        new ApiError('Complete the verification check, then try again.', 403, '', undefined, {
          code: 'human_verification_failed',
        }),
      )
      .mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen demoMode={false} signupOpen searchParams={noParams} />);

    await user.type(screen.getByLabelText(/^Email address/), 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse');
    const signIn = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => expect(held(signIn)).toBe(false));
    await user.click(signIn);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Complete the verification check, then try again.',
    );
    expect(screen.getByRole('group', { name: 'Verification' })).toBeInTheDocument();
    await waitFor(() => expect(widgetHost).not.toBeNull());
    expect(held(screen.getByRole('button', { name: 'Continue' }))).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(login).toHaveBeenCalledTimes(1);

    solveChallenge('solved-token');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(login).toHaveBeenLastCalledWith({
        email: 'reader@example.com',
        password: 'correct horse',
        termsRevision: '2026-09-24',
        turnstileToken: 'solved-token',
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
    const signIn = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => expect(held(signIn)).toBe(false));
    await user.click(signIn);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The Terms changed.');
    expect([
      follows(alert, screen.getByLabelText(/^Email address/)),
      follows(signIn, screen.getByRole('button', { name: 'Continue with Google' })),
    ]).toEqual([true, true]);
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

    const google = screen.getByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);

    await waitFor(() =>
      expect(oauthStart).toHaveBeenCalledWith('google', {
        returnTo: undefined,
        termsRevision: '2026-09-24',
        signup: false,
      }),
    );
  });

  it('holds account creation until the check is solved, then sends the Terms decision and token', async () => {
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
    for (const way of [create, google]) {
      expect(way).toHaveAccessibleDescription(SIGN_UP_AGREEMENT);
    }
    await waitFor(() => expect(widgetHost).not.toBeNull());
    expect(held(create)).toBe(true);
    expect(google).toBeDisabled();

    solveChallenge('solved-token');
    expect(held(create)).toBe(false);
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

  it('reserves the widget slot between the fields and submit, so solving it moves nothing', async () => {
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    const slot = screen.getByRole('group', { name: 'Verification' });
    const confirm = screen.getByLabelText(/^Confirm password/);
    const create = screen.getByRole('button', { name: 'Create account' });
    expect([follows(confirm, slot), follows(slot, create)]).toEqual([true, true]);

    await waitFor(() => expect(widgetHost).not.toBeNull());
    expect(slot).toContainElement(widgetHost);
    const rows = [...slot.parentElement!.children];
    solveChallenge('solved-token');
    expect(screen.getByRole('group', { name: 'Verification' })).toBe(slot);
    expect([...slot.parentElement!.children]).toEqual(rows);
  });

  it.each([
    [288, 'compact'],
    [300, 'flexible'],
  ])('asks for the widget size a %ipx slot fits: %s', async (width, size) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width,
      height: 0,
      top: 0,
      right: width,
      bottom: 0,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    renderWithProviders(
      <RegisterScreen demoMode={false} signupOpen replace={vi.fn()} searchParams={noParams} />,
    );

    await waitFor(() => expect(widgetHost).not.toBeNull());
    expect(widgetSize).toBe(size);
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
    await waitFor(() => expect(widgetHost).not.toBeNull());
    solveChallenge('solved-token');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByLabelText(/^Email address/)).toHaveAccessibleDescription(
        expect.stringContaining('Disposable addresses cannot sign up.'),
      ),
    );
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
    expect(screen.queryByText(/you agree to the/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
