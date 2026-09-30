import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { ServiceConfig } from '../config.ts';
import { policy } from '../config.ts';

export function cookieOptions(config: ServiceConfig) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: !policy.development_env_names.includes(config.appEnv.trim().toLowerCase()),
  };
}

export function setSessionCookie(c: Context, config: ServiceConfig, token: string): void {
  setCookie(c, config.session.cookieName, token, {
    ...cookieOptions(config),
    path: '/',
    maxAge: config.session.expireSeconds,
  });
}

export function clearSessionCookie(c: Context, config: ServiceConfig): void {
  deleteCookie(c, config.session.cookieName, { ...cookieOptions(config), path: '/' });
}

export function clearOAuthCookies(c: Context, config: ServiceConfig): void {
  clearAuthOAuthCookie(c, config);
  deleteCookie(c, policy.auth.oauth.integration_cookie_name, {
    ...cookieOptions(config),
    path: policy.auth.oauth.integration_cookie_path,
  });
}

export function clearAuthOAuthCookie(c: Context, config: ServiceConfig): void {
  deleteCookie(c, policy.auth.oauth.cookie_name, {
    ...cookieOptions(config),
    path: policy.auth.oauth.cookie_path,
  });
}
