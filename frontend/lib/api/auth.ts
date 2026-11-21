import { queryOptions } from '@tanstack/react-query';

import { getBootstrapReadTimeoutMs } from '@/lib/config/operational';
import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import {
  authResponseSchema,
  authSecuritySchema,
  oauthStartResponseSchema,
  policyRevisionSchema,
  policyStatusSchema,
  registrationResponseSchema,
} from '@citeladder/contracts/auth';
import type {
  AccountEntryRequest,
  MailboxChallengeRequest,
  MailboxLinkRequest,
  PasswordChangeRequest,
  PasswordConfirmationRequest,
} from '@citeladder/contracts/auth-requests';
import { strictValidate } from '@citeladder/contracts/validation';
import type {
  AuthResponse,
  OAuthProvider,
  OAuthStartResponse,
  RegistrationResponse,
} from '@citeladder/contracts';

export const authApi = {
  policies: async () =>
    strictValidate(policyRevisionSchema, await apiClient.get('/auth/policies'), 'auth.policies'),
  terms: async (signal?: AbortSignal) =>
    strictValidate(
      policyStatusSchema,
      await apiClient.get('/auth/terms', { signal }),
      'auth.terms',
    ),
  security: async (options?: ApiRequestOptions) =>
    strictValidate(
      authSecuritySchema,
      await apiClient.get('/auth/security', options),
      'auth.security',
    ),
  linkGoogle: async (password: string) =>
    strictValidate(
      oauthStartResponseSchema,
      await apiClient.post('/auth/link-google', { password } satisfies PasswordConfirmationRequest),
      'auth.linkGoogle',
    ),
  mailbox: async (
    operation:
      | 'resend-verification'
      | 'forgot-password'
      | 'verify-email'
      | 'reset-password'
      | 'change-password',
    body: MailboxLinkRequest | MailboxChallengeRequest | PasswordChangeRequest,
  ) => {
    const response = await apiClient.post<RegistrationResponse>(`/auth/${operation}`, body);
    return strictValidate(registrationResponseSchema, response, `auth.${operation}`);
  },
  passwordLink: async () =>
    strictValidate(
      registrationResponseSchema,
      await apiClient.post('/auth/password-link', undefined),
      'auth.passwordLink',
    ),
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
      } satisfies AccountEntryRequest,
      options,
    );
    return strictValidate(registrationResponseSchema, res, 'auth.register');
  },
  login: async (
    input: { email: string; password: string; termsRevision: string; turnstileToken?: string },
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<AuthResponse>(
      '/auth/login',
      {
        email: input.email,
        password: input.password,
        terms_revision: input.termsRevision,
        accept_terms: true,
        turnstile_token: input.turnstileToken,
      } satisfies AccountEntryRequest,
      options,
    );
    return strictValidate(authResponseSchema, res, 'auth.login').user;
  },
  logout: (options?: ApiRequestOptions) => apiClient.post<void>('/auth/logout', undefined, options),
  logoutAndDisconnect: (options?: ApiRequestOptions) =>
    apiClient.post<void>('/auth/logout-and-disconnect', undefined, options),
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

export const authQueries = {
  me: () =>
    queryOptions({
      queryKey: queryKeys.auth.me(),
      queryFn: ({ signal }) => authApi.me({ signal, timeoutMs: getBootstrapReadTimeoutMs() }),
    }),
  policies: () =>
    queryOptions({
      queryKey: queryKeys.auth.policies(),
      queryFn: () => authApi.policies(),
      staleTime: Number.POSITIVE_INFINITY,
    }),
  terms: () =>
    queryOptions({
      queryKey: queryKeys.auth.terms(),
      queryFn: ({ signal }) => authApi.terms(signal),
    }),
  security: () =>
    queryOptions({
      queryKey: queryKeys.auth.security(),
      queryFn: ({ signal }) => authApi.security({ signal }),
    }),
};
