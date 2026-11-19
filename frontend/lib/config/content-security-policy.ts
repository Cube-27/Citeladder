import type { AstroUserConfig } from 'astro';
import { CSP_REPORTS_PATH } from '@citeladder/contracts/route-ownership';
import { RAZORPAY_CHECKOUT_SCRIPT } from './billing';
import { TURNSTILE_ORIGIN } from './turnstile';

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

// The product's policies report violations to the API's same-origin sink
// through the Reporting API endpoint this names.
const REPORT_ENDPOINT = 'csp';
export const APP_REPORTING_ENDPOINTS = `${REPORT_ENDPOINT}="${CSP_REPORTS_PATH}"`;

// Sign-up and the email-link forms load the Turnstile widget from its origin
// and render its challenge in a frame from it.
export const APP_CONTENT_SECURITY_POLICY = [
  ...DOCUMENT_DIRECTIVES,
  `script-src 'self' ${RAZORPAY_CHECKOUT_SCRIPT} ${TURNSTILE_ORIGIN} ${CLOUDFLARE_BEACON_SOURCES.join(' ')}`,
  "img-src 'self' data: blob: https://img.logo.dev",
  "connect-src 'self' https://api.razorpay.com https://cloudflareinsights.com/cdn-cgi/rum",
  `frame-src https://api.razorpay.com ${TURNSTILE_ORIGIN}`,
  "form-action 'self'",
  `report-to ${REPORT_ENDPOINT}`,
].join('; ');

// Trusted Types, reported and not enforced: the default policy
// (lib/trusted-types.ts) passes the known script URLs, and every other
// string reaching a DOM injection sink is reported until the sinks are known.
export const APP_CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "require-trusted-types-for 'script'",
  'trusted-types default',
  `report-to ${REPORT_ENDPOINT}`,
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

// The marketing footer hotlinks the launch-directory badges from their hosts.
const LAUNCH_BADGE_IMAGE_ORIGINS = ['https://www.codehype.ai', 'https://tools.launchllama.co'];

type AstroScriptHash = `sha256-${string}`;

// Astro hashes only its compiled framework/inline scripts; `scriptHashes` adds
// the build-time hashes of our own inline scripts (the speculation rules). No
// runtime blanket hashing/noncing of HTML.
function astroContentSecurityPolicy({
  scriptSources,
  scriptHashes,
  directives,
  imageSources = [],
}: {
  scriptSources: string[];
  scriptHashes: readonly AstroScriptHash[];
  directives: AstroDirective[];
  imageSources?: string[];
}): AstroContentSecurityPolicy {
  return {
    scriptDirective: {
      hashes: [...scriptHashes],
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
      `img-src ${["'self'", 'data:', ...imageSources].join(' ')}`,
      "form-action 'self'",
      ...directives,
    ],
  };
}

// Server-rendered marketing emits the policy as a response header; prerendered
// pages carry it as a <meta>, where browsers ignore (and log) frame-ancestors.
// X-Frame-Options DENY denies framing on both: the generated _headers file for
// assets, withSiteHeaders for Worker responses.
export function marketingContentSecurityPolicy({
  analyticsEnabled,
  scriptHashes,
}: {
  analyticsEnabled: boolean;
  scriptHashes: readonly AstroScriptHash[];
}): AstroContentSecurityPolicy {
  return astroContentSecurityPolicy({
    // The contact form's Turnstile widget loads from this origin and renders
    // its challenge in a frame from it; no other page requests either.
    scriptSources: [
      TURNSTILE_ORIGIN,
      ...(analyticsEnabled ? ['https://www.googletagmanager.com/gtag/js'] : []),
    ],
    scriptHashes,
    directives: [
      `frame-src ${TURNSTILE_ORIGIN}`,
      analyticsEnabled
        ? "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum https://www.google-analytics.com https://region1.google-analytics.com"
        : "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum",
    ],
    imageSources: LAUNCH_BADGE_IMAGE_ORIGINS,
  });
}

// Static docs receive the policy as a <meta> element, where browsers ignore
// frame-ancestors; X-Frame-Options in the docs _headers file denies framing.
export function docsContentSecurityPolicy(
  scriptHashes: readonly AstroScriptHash[],
): AstroContentSecurityPolicy {
  return astroContentSecurityPolicy({
    scriptSources: [],
    scriptHashes,
    directives: [
      "frame-src 'none'",
      "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum",
    ],
  });
}
