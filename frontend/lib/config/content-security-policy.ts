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

type AstroContentSecurityPolicy = NonNullable<AstroUserConfig['security']>['csp'];
type AstroDirective = NonNullable<
  Exclude<AstroContentSecurityPolicy, boolean | undefined>['directives']
>[number];

// Astro hashes only its compiled framework/inline scripts. No runtime blanket
// hashing/noncing of HTML.
function astroContentSecurityPolicy(
  scriptSources: string[],
  directives: AstroDirective[],
): AstroContentSecurityPolicy {
  return {
    scriptDirective: {
      resources: [
        "'self'",
        ...CLOUDFLARE_BEACON_SOURCES,
        { resource: "'none'", kind: 'attribute' },
        ...scriptSources,
      ],
    },
    styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    directives: [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "font-src 'self'",
      "img-src 'self' data:",
      "frame-src 'none'",
      "form-action 'self'",
      ...directives,
    ],
  };
}

// Server-rendered marketing emits the policy as a response header.
export function marketingContentSecurityPolicy(
  analyticsEnabled: boolean,
): AstroContentSecurityPolicy {
  return astroContentSecurityPolicy(
    analyticsEnabled ? ['https://www.googletagmanager.com/gtag/js'] : [],
    [
      "frame-ancestors 'none'",
      analyticsEnabled
        ? "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum https://www.google-analytics.com https://region1.google-analytics.com"
        : "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum",
    ],
  );
}

// Static docs receive the policy as a <meta> element, where browsers ignore
// frame-ancestors; X-Frame-Options in the docs _headers file denies framing.
export const DOCS_CONTENT_SECURITY_POLICY = astroContentSecurityPolicy(
  [],
  ["connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum"],
);
