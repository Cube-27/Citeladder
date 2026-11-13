/**
 * Powerful features no CiteLadder page or embedded widget uses. Payment,
 * clipboard, fullscreen and the private-state-token features Turnstile may
 * ask for keep the browser's defaults.
 */
const DENIED_FEATURES = [
  'accelerometer',
  'browsing-topics',
  'camera',
  'display-capture',
  'geolocation',
  'gyroscope',
  'hid',
  'magnetometer',
  'microphone',
  'midi',
  'serial',
  'usb',
];

/**
 * Security headers every CiteLadder Worker response carries, whether the
 * Worker sets them (middleware, product Worker) or asset delivery does
 * (a generated `_headers` file).
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': DENIED_FEATURES.map((feature) => `${feature}=()`).join(', '),
  // Not `same-origin`: Razorpay Checkout opens payment popups that must keep
  // their opener.
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

/**
 * The product host's headers. Nothing on it is meant to be embedded by
 * another site, and the product is never indexed.
 */
export const APP_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  ...SECURITY_HEADERS,
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
};

/**
 * Product pages an MCP client's OAuth window can pass through (sign-in on the
 * way to consent). They send no opener policy, which would cut the window off
 * from the client that opened it; the worker adds the consent page itself.
 */
export const OPENER_KEPT_AUTH_PATHS: ReadonlySet<string> = new Set(['/login', '/register']);

/** The app shell document: revalidated on every use, so the back-forward cache may keep it. */
export const APP_SHELL_CACHE_CONTROL = 'no-cache';

/** Unhashed files that change rarely, such as fonts and the favicon. */
export const STABLE_ASSET_CACHE_CONTROL = 'public, max-age=2592000';

/** One Cloudflare `_headers` rule: a path pattern and the headers it sets. */
export function headersRule(path: string, headers: Readonly<Record<string, string>>): string {
  return [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`), ''].join(
    '\n',
  );
}
