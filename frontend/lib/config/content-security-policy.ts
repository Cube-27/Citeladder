import type { AstroUserConfig } from 'astro';

// Browser requests use same-origin APIs. Logo.dev supplies app brand images;
// the existing Razorpay adapter loads its SDK and isolated checkout frame.
// Inline styles remain necessary for React layout, charts and consent HTML.
const DOCUMENT_DIRECTIVES = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "script-src-attr 'none'",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
];

// Both deployed hosts inject the versioned Cloudflare Web Analytics beacon.
// Permit only that script path (including its version suffix), not the CDN.
const CLOUDFLARE_BEACON_SOURCES = [
  'https://static.cloudflareinsights.com/beacon.min.js',
  'https://static.cloudflareinsights.com/beacon.min.js/',
];

export const APP_CONTENT_SECURITY_POLICY = [
  ...DOCUMENT_DIRECTIVES,
  `script-src 'self' https://checkout.razorpay.com/v1/checkout.js ${CLOUDFLARE_BEACON_SOURCES.join(' ')}`,
  "img-src 'self' data: blob: https://img.logo.dev",
  "connect-src 'self' https://api.razorpay.com https://cloudflareinsights.com/cdn-cgi/rum",
  'frame-src https://api.razorpay.com',
  "form-action 'self'",
].join('; ');

// Script-free proxy/error HTML receives a policy too. Never replace a stricter
// upstream policy (for example the backend's sandboxed logo response).
export const FALLBACK_CONTENT_SECURITY_POLICY = [
  ...DOCUMENT_DIRECTIVES,
  "script-src 'none'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "form-action 'self'",
].join('; ');

export function marketingContentSecurityPolicy(
  analyticsEnabled: boolean,
): NonNullable<AstroUserConfig['security']>['csp'] {
  return {
    // Astro hashes only its compiled framework/inline scripts, and emits the
    // matching response header. No runtime blanket hashing/noncing of HTML.
    scriptDirective: {
      resources: [
        "'self'",
        ...CLOUDFLARE_BEACON_SOURCES,
        { resource: "'none'", kind: 'attribute' },
        ...(analyticsEnabled ? ['https://www.googletagmanager.com/gtag/js'] : []),
      ],
    },
    styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    directives: [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "font-src 'self'",
      "img-src 'self' data:",
      "frame-src 'none'",
      "form-action 'self'",
      analyticsEnabled
        ? "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum https://www.google-analytics.com https://region1.google-analytics.com"
        : "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum",
    ],
  };
}
