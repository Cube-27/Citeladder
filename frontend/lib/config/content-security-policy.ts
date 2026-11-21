import type { AstroUserConfig } from 'astro';
import { CSP_REPORTS_PATH } from '@citeladder/contracts/route-ownership';
import { RAZORPAY_CHECKOUT_SCRIPT } from './billing';
import { TURNSTILE_ORIGIN } from './turnstile';

const DOCUMENT_DIRECTIVES = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "script-src-attr 'none'",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
];

const CLOUDFLARE_BEACON_SOURCES = [
  'https://static.cloudflareinsights.com/beacon.min.js',
  'https://static.cloudflareinsights.com/beacon.min.js/',
];

const REPORT_ENDPOINT = 'csp';
export const APP_REPORTING_ENDPOINTS = `${REPORT_ENDPOINT}="${CSP_REPORTS_PATH}"`;

export const APP_CONTENT_SECURITY_POLICY = [
  ...DOCUMENT_DIRECTIVES,
  `script-src 'self' ${RAZORPAY_CHECKOUT_SCRIPT} ${TURNSTILE_ORIGIN} ${CLOUDFLARE_BEACON_SOURCES.join(' ')}`,
  "img-src 'self' data: blob: https://img.logo.dev",
  "connect-src 'self' https://api.razorpay.com https://cloudflareinsights.com/cdn-cgi/rum",
  `frame-src https://api.razorpay.com ${TURNSTILE_ORIGIN}`,
  "form-action 'self'",
  `report-to ${REPORT_ENDPOINT}`,
].join('; ');

export const APP_CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "require-trusted-types-for 'script'",
  'trusted-types default',
  `report-to ${REPORT_ENDPOINT}`,
].join('; ');

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

const LAUNCH_BADGE_IMAGE_ORIGINS = ['https://www.codehype.ai', 'https://tools.launchllama.co'];

type AstroScriptHash = `sha256-${string}`;

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

export function marketingContentSecurityPolicy({
  analyticsEnabled,
  scriptHashes,
}: {
  analyticsEnabled: boolean;
  scriptHashes: readonly AstroScriptHash[];
}): AstroContentSecurityPolicy {
  return astroContentSecurityPolicy({
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
