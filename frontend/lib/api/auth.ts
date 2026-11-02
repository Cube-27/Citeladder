/**
 * Auth domain endpoints (F2). Cookie-session; `credentials:'include'` is set by
 * the transport. Every response passes through `strictValidate`.
 */
import { apiClient, type ApiRequestOptions } from './client';
import {
  authResponseSchema,
  authSecuritySchema,
  oauthStartResponseSchema,
  policyRevisionSchema,
  policyStatusSchema,
  registrationResponseSchema,
} from '@citeladder/contracts/auth';
import { strictValidate } from '@citeladder/contracts/validation';
import type {
  AuthResponse,
  OAuthProvider,
  OAuthStartResponse,
  RegistrationResponse,
} from './types';

export const authApi = {
  /** The published Terms revision the sign-in and sign-up forms ask a visitor to accept. */
  policies: async () =>
    strictValidate(policyRevisionSchema, await apiClient.get('/auth/policies'), 'auth.policies'),
  /** The signed-in person's own Terms decision on the published revision. */
  terms: async (signal?: AbortSignal) =>
    strictValidate(
      policyStatusSchema,
      await apiClient.get('/auth/terms', { signal }),
      'auth.terms',
    ),
  security: async () =>
    strictValidate(authSecuritySchema, await apiClient.get('/auth/security'), 'auth.security'),
  linkGoogle: async (password: string) =>
    strictValidate(
      oauthStartResponseSchema,
      await apiClient.post('/auth/link-google', { password }),
      'auth.linkGoogle',
    ),
  mailbox: async (
    operation:
      | 'resend-verification'
      | 'forgot-password'
      | 'verify-email'
      | 'reset-password'
      | 'change-password',
    body: Record<string, string> = {},
  ) => {
    const response = await apiClient.post<RegistrationResponse>(`/auth/${operation}`, body);
    return strictValidate(registrationResponseSchema, response, `auth.${operation}`);
  },
  /** Email the signed-in person a link to set or reset their own password. */
  passwordLink: async () =>
    strictValidate(
      registrationResponseSchema,
      await apiClient.post('/auth/password-link', undefined),
      'auth.passwordLink',
    ),
  /**
   * Create an account; the request carries the Terms decision and the
   * Turnstile token solved on the form.
   */
  register: async (
    input: {
      email: string;
      password: string;
      termsRevision: string;
      turnstileToken: string;
      returnTo?: string;
    },
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<RegistrationResponse>(
      '/auth/register',
      {
        email: input.email,
        password: input.password,
        terms_revision: input.termsRevision,
        accept_terms: true,
        turnstile_token: input.turnstileToken,
        return_to: input.returnTo,
      },
      options,
    );
    return strictValidate(registrationResponseSchema, res, 'auth.register');
  },
  /** Sign in; the request carries the Terms decision made on the form. */
  login: async (
    input: { email: string; password: string; termsRevision: string },
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<AuthResponse>(
      '/auth/login',
      {
        email: input.email,
        password: input.password,
        terms_revision: input.termsRevision,
        accept_terms: true,
      },
      options,
    );
    return strictValidate(authResponseSchema, res, 'auth.login').user;
  },
  logout: (options?: ApiRequestOptions) => apiClient.post<void>('/auth/logout', undefined, options),
  // Also disconnects every MCP client and revokes the API keys this person created.
  logoutAndDisconnect: (options?: ApiRequestOptions) =>
    apiClient.post<void>('/auth/logout-and-disconnect', undefined, options),
  // OAuth scaffold: a configured provider answers 200 with the authorize URL
  // to navigate to; an unconfigured one answers 503
  // (`detail.code = 'oauth_provider_not_configured'`), which callers surface
  // as a coming-soon notice rather than an error.
  //
  // Every start carries the Terms decision made on the form; only a sign-up
  // start may create an account, and a sign-in start for an unknown address
  // lands on sign-up instead. A sign-up start also carries the Turnstile token.
  oauthStart: async (
    provider: OAuthProvider,
    input: { returnTo?: string; termsRevision: string } & (
      | { signup: true; turnstileToken: string }
      | { signup: false }
    ),
    options?: ApiRequestOptions,
  ) => {
    const query = new URLSearchParams({
      accept_terms: 'true',
      terms_revision: input.termsRevision,
    });
    if (input.signup) {
      query.set('signup', 'true');
      query.set('turnstile_token', input.turnstileToken);
    }
    if (input.returnTo) query.set('return_to', input.returnTo);
    const res = await apiClient.get<OAuthStartResponse>(
      `/auth/oauth/${provider}/start?${query}`,
      options,
    );
    return strictValidate(oauthStartResponseSchema, res, 'auth.oauthStart');
  },
  me: async (options?: ApiRequestOptions) => {
    const res = await apiClient.get<AuthResponse>('/auth/me', options);
    return strictValidate(authResponseSchema, res, 'auth.me').user;
  },
};
