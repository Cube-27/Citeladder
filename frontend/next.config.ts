import withBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import { resolveBackendOrigin } from './lib/config/backend-origin';

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
 *   BACKEND_ORIGIN — REQUIRED, server-only. The absolute origin of FastAPI,
 *     e.g. `http://localhost:8000` locally or the internal service URL in production.
 *     It is consumed only by server-side runtime configuration, is not prefixed
 *     with `NEXT_PUBLIC_` or `VITE_`, and is therefore never exposed to the browser.
 *     It defaults to `http://localhost:8000` for local development; production builds fail
 *     closed when it is absent or points at loopback.
 */

const BACKEND_ORIGIN = resolveBackendOrigin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Next 16.3 navigation contract: prerender a reusable shell for each route,
  // prefetch that shell once, and stream URL-specific/dynamic content after
  // the destination renders. Development validation reports any route work
  // that would block the immediate shell.
  cacheComponents: true,
  partialPrefetching: true,
  // Pinned explicitly because the repository root now carries a delegating
  // `package.json`. Next infers the tracing root by walking up for a lockfile
  // or workspace manifest, so an ancestor manifest can silently move the root
  // and change which files land in `.next/standalone`. This directory is the
  // real application root; state it rather than depend on the inference.
  outputFileTracingRoot: import.meta.dirname,
  // Next 16.3's standalone tracer copies only `@swc/helpers/cjs`, but the
  // generated server chunks require the `esm/` variants, so `node server.js`
  // in the runtime image dies on `Cannot find module
  // .../@swc/helpers/esm/_interop_require_default.js`. Tracing the whole
  // package restores a bootable standalone build.
  outputFileTracingIncludes: {
    '/**': ['./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**'],
  },
  // Next 16 blocks cross-origin requests to /_next/* dev resources. The app is
  // opened via 127.0.0.1 while the dev server treats `localhost` as canonical,
  // so allow the loopback IP or the browser gets a blank (unhydrated) page.
  // `**.vorflux.com` covers the Vorflux preview tunnels (multi-level
  // subdomains) so the shared public preview URL hydrates the same way.
  allowedDevOrigins: ['127.0.0.1', '**.vorflux.com'],
  // Brand-avatar fallback for sites that block our own crawler. `<BrandLogo>`
  // renders these `unoptimized`, so nothing is proxied through the Next image
  // optimizer — but the host must still be allowlisted for `next/image`.
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: 'img.logo.dev' }],
  },
  // `/public` assets are served unhashed, so the browser revalidates them on
  // every navigation without an explicit policy (Lighthouse flags this; only
  // `/_next/static` is cached by default). The `:file*.:ext(...)` shape anchors
  // on a real dot — a bare `(png|webp)` suffix group also matches a route like
  // `/blog/what-is-png` and would freeze an HTML page in the cache.
  async headers() {
    return [
      ...['/pricing', '/settings', '/billing'].map((source) => ({
        source,
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com" +
                (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
              "style-src 'self' 'unsafe-inline'",
              'frame-src https://api.razorpay.com https://checkout.razorpay.com',
              "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
              "img-src 'self' data: blob: https://img.logo.dev https://cdn.razorpay.com",
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      })),
      {
        // Next ships `max-age=0, must-revalidate` on metadata routes, so every
        // crawler fetch of these two fell through the CDN to the origin in
        // asia-south1 and some timed out — Search Console reported robots.txt
        // as unreachable. Both are build-time constants (the route list and
        // the content modules are compiled in), so they only change on deploy.
        // `s-maxage` lets the edge serve them while `max-age=0` keeps crawlers
        // revalidating, so an updated file is picked up on the next deploy.
        // Route segment `revalidate` is not an option here: `cacheComponents`
        // rejects it at build time.
        source: '/:file(robots.txt|sitemap.xml)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate, s-maxage=86400',
          },
        ],
      },
      {
        // Self-hosted font files are content-stable: a new cut ships under a
        // new filename, so a year of immutable caching can never go stale.
        source: '/:file*.:ext(woff2|woff|ttf|otf)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Images DO get replaced in place (logo, brand marks, blog art), so
        // they get a month of freshness with a month of stale-while-revalidate
        // rather than `immutable` — a swapped asset propagates instead of
        // being pinned in visitors' caches for a year.
        source: '/:file*.:ext(png|jpg|jpeg|webp|avif|gif|svg|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=2592000',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
      {
        source: '/mcp/:path*',
        destination: `${BACKEND_ORIGIN}/mcp/:path*`,
      },
      {
        source: '/mcp',
        destination: `${BACKEND_ORIGIN}/mcp`,
      },
      ...['authorize', 'token', 'register', 'revoke'].map((path) => ({
        source: `/${path}`,
        destination: `${BACKEND_ORIGIN}/${path}`,
      })),
      {
        source: '/.well-known/oauth-authorization-server',
        destination: `${BACKEND_ORIGIN}/.well-known/oauth-authorization-server`,
      },
      {
        source: '/.well-known/oauth-protected-resource/mcp',
        destination: `${BACKEND_ORIGIN}/.well-known/oauth-protected-resource/mcp`,
      },
    ];
  },
};

/**
 * Bundle analyzer, off unless `ANALYZE=true`.
 *
 * READ THIS BEFORE REACHING FOR IT: `@next/bundle-analyzer` is a webpack
 * plugin and Next 16 builds with Turbopack by default, so `ANALYZE=true pnpm
 * build` prints "not compatible with Turbopack builds, no report will be
 * generated" and writes nothing. Use `pnpm analyze` instead, which runs
 * Next's own Turbopack analyzer. This wrapper is kept because it is inert when
 * disabled and becomes correct the moment a build runs on webpack.
 *
 * Wraps only the DEFAULT export: `resolveBackendOrigin` above stays a plain
 * named export because `next.config.test.ts` imports it directly, and that
 * import executes this module — so the wrapper has to stay a no-op passthrough
 * when the flag is unset, which is exactly what `enabled: false` gives.
 */
export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig);
