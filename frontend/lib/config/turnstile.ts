/**
 * Serves the Turnstile script and its challenge frame; the marketing CSP (the
 * contact form) and the product CSP (sign-up and email-link forms) allow it.
 */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
export const TURNSTILE_VERIFY_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;
export const TURNSTILE_VERIFY_TIMEOUT_MS = 5_000;
/**
 * The flexible widget's minimum width. A narrower slot (a 320px phone with its
 * gutters) renders the compact widget, which is 150px wide, instead.
 */
export const TURNSTILE_FLEXIBLE_MIN_WIDTH_PX = 300;
/** Cloudflare's documented always-pass test site key, for local serving only. */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
