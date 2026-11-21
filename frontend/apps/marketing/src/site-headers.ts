import { FALLBACK_CONTENT_SECURITY_POLICY } from '@/lib/config/content-security-policy';
import { SECURITY_HEADERS } from '@/lib/config/security-headers';

export function withSiteHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', FALLBACK_CONTENT_SECURITY_POLICY);
  }
  const https = new URL(request.url).protocol === 'https:';
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (https || name !== 'Strict-Transport-Security') headers.set(name, value);
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  return new Response(response.body, { status: response.status, headers });
}
