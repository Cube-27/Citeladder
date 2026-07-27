import type { NextConfig } from 'next';

/**
 * Next.js config — same-origin API proxy (F2).
 *
 * The browser must only ever call `/api/...` **relative** (invariant 12). The
 * `rewrites()` below proxy `/api/:path*` to the server-only `BACKEND_ORIGIN`
 * environment variable, so the backend URL never reaches the client bundle and
 * there is no cross-origin request (gotcha 2: a cross-origin backend behind a
 * tunnel double-sets `Access-Control-Allow-Origin`; the same-origin proxy
 * avoids that entirely).
 *
 * Environment:
 *   BACKEND_ORIGIN — REQUIRED, server-only. The absolute origin of the FastAPI
 *     backend, e.g. `http://localhost:8000` in local dev or the internal
 *     service URL in production. It is read only in `next.config.ts` (build /
 *     server), is NOT prefixed with `NEXT_PUBLIC_`, and is therefore never
 *     exposed to the browser. Defaults to `http://localhost:8000` for local dev;
 *     production builds fail closed when it is absent or points at loopback.
 */
export function resolveBackendOrigin(
  configuredValue = process.env.BACKEND_ORIGIN,
  production = process.env.NODE_ENV === 'production',
) {
  const configured = configuredValue?.trim();
  if (!configured) {
    if (production) throw new Error('BACKEND_ORIGIN is required for a production build.');
    return 'http://localhost:8000';
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('BACKEND_ORIGIN must be an absolute http(s) origin.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('BACKEND_ORIGIN must be a credential-free http(s) origin.');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('BACKEND_ORIGIN must not include a path, query, or fragment.');
  }
  const host = parsed.hostname.toLowerCase().replace(/[.]+$/, '');
  if (
    production &&
    (host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.startsWith('127.'))
  ) {
    throw new Error('BACKEND_ORIGIN must not use a loopback host in production.');
  }
  return parsed.origin;
}

const BACKEND_ORIGIN = resolveBackendOrigin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Next 16 blocks cross-origin requests to /_next/* dev resources. The app is
  // opened via 127.0.0.1 while the dev server treats `localhost` as canonical,
  // so allow the loopback IP or the browser gets a blank (unhydrated) page.
  // `**.vorflux.com` covers the Vorflux preview tunnels (multi-level
  // subdomains) so the shared public preview URL hydrates the same way.
  allowedDevOrigins: ['127.0.0.1', '**.vorflux.com'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
