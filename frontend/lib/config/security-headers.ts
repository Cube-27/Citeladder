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
};

/** Unhashed files that change rarely, such as fonts and the favicon. */
export const STABLE_ASSET_CACHE_CONTROL = 'public, max-age=2592000';

/** One Cloudflare `_headers` rule: a path pattern and the headers it sets. */
export function headersRule(path: string, headers: Readonly<Record<string, string>>): string {
  return [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`), ''].join(
    '\n',
  );
}
