import { FALLBACK_CONTENT_SECURITY_POLICY } from '@/lib/config/content-security-policy';
import { SECURITY_HEADERS } from '@/lib/config/security-headers';

/**
 * Security and cache headers for a response the Worker produces itself.
 * Prerendered pages are static assets: their headers come from the generated
 * `_headers` file (scripts/check-marketing-worker-output.mjs).
 */
export function withSiteHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', FALLBACK_CONTENT_SECURITY_POLICY);
  }
  const https = new URL(request.url).protocol === 'https:';
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // Local Wrangler serves plain HTTP, where HSTS would be meaningless.
    if (https || name !== 'Strict-Transport-Security') headers.set(name, value);
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  return new Response(response.body, { status: response.status, headers });
}
