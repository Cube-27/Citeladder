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

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': DENIED_FEATURES.map((feature) => `${feature}=()`).join(', '),
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

export const APP_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  ...SECURITY_HEADERS,
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
};

export const OPENER_KEPT_AUTH_PATHS: ReadonlySet<string> = new Set(['/login', '/register']);

export const APP_SHELL_CACHE_CONTROL = 'no-cache';

export const STABLE_ASSET_CACHE_CONTROL = 'public, max-age=2592000';

export function headersRule(path: string, headers: Readonly<Record<string, string>>): string {
  return [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`), ''].join(
    '\n',
  );
}
