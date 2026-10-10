/** Serves the Turnstile script and its challenge frame; the marketing CSP allows it. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
export const TURNSTILE_VERIFY_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;
export const TURNSTILE_VERIFY_TIMEOUT_MS = 5_000;
