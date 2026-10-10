/**
 * Auth domain endpoints (F2). Cookie-session; `credentials:'include'` is set by
 * the transport. Every response passes through `strictValidate`.
 */
import { apiClient, type ApiRequestOptions } from './client';
import {
  authResponseSchema,
  authSecuritySchema,
  oauthStartResponseSchema,
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
  register: async (
    email: string,
    password: string,
    options?: ApiRequestOptions,
    returnTo?: string,
  ) => {
    const res = await apiClient.post<RegistrationResponse>(
      '/auth/register',
      { email, password, return_to: returnTo },
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
  oauthStart: async (provider: OAuthProvider, options?: ApiRequestOptions, returnTo?: string) => {
    const suffix = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
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
