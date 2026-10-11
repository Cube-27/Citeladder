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
  /** The published Terms revision the signup form asks a visitor to accept. */
  policies: async () =>
    strictValidate(policyRevisionSchema, await apiClient.get('/auth/policies'), 'auth.policies'),
  /** The signed-in person's own Terms decision on the published revision. */
  terms: async (signal?: AbortSignal) =>
    strictValidate(
      policyStatusSchema,
      await apiClient.get('/auth/terms', { signal }),
      'auth.terms',
    ),
  /** Record that decision when the person has none (review before creating a workspace). */
  acceptTerms: async (termsRevision: string) =>
    strictValidate(
      policyStatusSchema,
      await apiClient.post('/auth/terms', { terms_revision: termsRevision, accept_terms: true }),
      'auth.acceptTerms',
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
  /** Create an account; the request carries the Terms decision made on the form. */
  register: async (
    input: { email: string; password: string; termsRevision: string; returnTo?: string },
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<RegistrationResponse>(
      '/auth/register',
      {
        email: input.email,
        password: input.password,
        terms_revision: input.termsRevision,
        accept_terms: true,
        return_to: input.returnTo,
      },
      options,
    );
    return strictValidate(registrationResponseSchema, res, 'auth.register');
  },
  login: async (email: string, password: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<AuthResponse>('/auth/login', { email, password }, options);
    return strictValidate(authResponseSchema, res, 'auth.login').user;
  },
  logout: (options?: ApiRequestOptions) => apiClient.post<void>('/auth/logout', undefined, options),
  // OAuth scaffold: a configured provider answers 200 with the authorize URL
  // to navigate to; an unconfigured one answers 503
  // (`detail.code = 'oauth_provider_not_configured'`), which callers surface
  // as a coming-soon notice rather than an error.
  //
  // Only a sign-up start carries the Terms decision, and only it may create an
  // account; a sign-in start for an unknown address lands on sign-up instead.
  oauthStart: async (
    provider: OAuthProvider,
    input: { returnTo?: string; signupTermsRevision?: string } = {},
    options?: ApiRequestOptions,
  ) => {
    const query = new URLSearchParams();
    if (input.returnTo) query.set('return_to', input.returnTo);
    if (input.signupTermsRevision) {
      query.set('accept_terms', 'true');
      query.set('terms_revision', input.signupTermsRevision);
    }
    const suffix = query.size ? `?${query}` : '';
    const res = await apiClient.get<OAuthStartResponse>(
      `/auth/oauth/${provider}/start${suffix}`,
      options,
    );
    return strictValidate(oauthStartResponseSchema, res, 'auth.oauthStart');
  },
  me: async (options?: ApiRequestOptions) => {
    const res = await apiClient.get<AuthResponse>('/auth/me', options);
    return strictValidate(authResponseSchema, res, 'auth.me').user;
  },
};
