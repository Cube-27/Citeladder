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

/**
 * What a sign-out asks the browser to clear beyond the cookies it deletes: the
 * HTTP and back-forward caches holding the account's pages. Not `"storage"`,
 * which would also clear device preferences (theme, cookie consent), nor
 * `"cookies"`, which reaches every host on the site.
 */
const SIGN_OUT_CLEAR_SITE_DATA = '"cache"';

export function endBrowserSession(c: Context, config: ServiceConfig): void {
  clearSessionCookie(c, config);
  clearOAuthCookies(c, config);
  c.header('Clear-Site-Data', SIGN_OUT_CLEAR_SITE_DATA);
}

export function clearOAuthCookies(c: Context, config: ServiceConfig): void {
  clearAuthOAuthCookie(c, config);
  deleteCookie(c, policy.auth.oauth.integration_cookie_name, {
    ...cookieOptions(config),
    path: policy.auth.oauth.integration_cookie_path,
  });
}

export function clearAuthOAuthCookie(c: Context, config: ServiceConfig): void {
  deleteCookie(c, `${policy.auth.oauth.cookie_name}_continuation`, {
    ...cookieOptions(config),
    path: policy.auth.oauth.cookie_path,
  });
  deleteCookie(c, policy.auth.oauth.cookie_name, {
    ...cookieOptions(config),
    path: policy.auth.oauth.cookie_path,
  });
}
