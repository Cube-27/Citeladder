/**
 * Pricing content for /pricing (tier cards + comparison table).
 *
 * Capability claims (what each tier can DO) are grounded in README.md and
 * docs/site-health.md — those are product facts, not marketing.
 *
 * Commercial terms (prices, quotas, retention, support) are set here as the
 * published price list. They follow one principle: because audits run on the
 * customer's own provider keys, model spend goes to their provider at provider
 * rates and Searchify never marks it up. The subscription therefore prices the
 * PLATFORM — projects, monitored URLs, history retention and support — not
 * per-audit usage, so a heavier audit month never produces a surprise invoice.
 *
 * Every number below is a real commitment the product can honour today. If a
 * commercial term changes, change it here — this module is the single source
 * for both the tier cards and the comparison table.
 */

export type PricingTableRow = {
  dimension: string;
  free: string;
  starter: string;
  pro: string;
  enterprise: string;
};

export type PricingTierKey = Exclude<keyof PricingTableRow, 'dimension'>;

export type PricingTier = {
  key: PricingTierKey;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: { label: string; href: string };
  features: readonly string[];
  highlighted?: boolean;
  primaryCta?: boolean;
};

/** Shown once above the tiers — the reason every tier is a flat fee. */
export const PRICING_NOTE =
  'Audits run on your own provider keys, so model usage is billed by your provider at their rates — never marked up by us. Subscriptions cover the platform, not per-audit usage.';

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'See what the evidence looks like before you commit.',
    cta: { label: 'Start free', href: '/register' },
    features: [
      '1 project, 1 seat',
      // Grounded in docs/site-health.md — the `free` entitlement.
      'Site health sample crawl — deterministic, seeded, read-only',
      'Technical + AEO scores for every sampled page',
      'Grouped issues with severity and remediation guidance',
      '30 days of run history',
    ],
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '$49',
    cadence: 'per month',
    blurb: 'Monitor the pages that matter, on a cadence you control.',
    cta: { label: 'Start free trial', href: '/register' },
    primaryCta: true,
    features: [
      'Everything in Free, plus:',
      '3 projects, 3 seats',
      // Grounded in docs/site-health.md — the `starter` entitlement.
      'Full progressive URL inventory — discovered totals disclosed',
      '100 monitored URLs — you pick the pages',
      'Authenticated CSV + Markdown exports',
      '12 months of run history',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$149',
    cadence: 'per month',
    blurb: 'For teams benchmarking competitors and reporting trends.',
    cta: { label: 'Start free trial', href: '/register' },
    highlighted: true,
    primaryCta: true,
    features: [
      'Everything in Starter, plus:',
      '15 projects, 10 seats',
      '1,000 monitored URLs',
      'Cross-run trends — engine, time-range and granularity controls',
      'Competitor benchmarking and share of answers',
      'Unlimited run history',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual agreement',
    blurb: 'Custom volumes, security review, and self-hosting.',
    cta: { label: 'Talk to sales', href: '/enterprise' },
    features: [
      'Everything in Pro, plus:',
      'Unlimited projects, seats and monitored URLs',
      // Both grounded in README.md (Docker Compose quick start; the
      // workspace-isolation guarantee).
      'Self-host option — Docker Compose deployment inside your network',
      'Strict workspace isolation with UUID identifiers throughout',
      'Security review and a named contact',
    ],
  },
];

export const PRICING_TABLE_ROWS: readonly PricingTableRow[] = [
  {
    dimension: 'Three-engine audits — ChatGPT · Gemini · Claude',
    free: '✓',
    starter: '✓',
    pro: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Your own provider keys — encrypted at rest',
    free: '✓',
    starter: '✓',
    pro: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Deterministic scoring — versioned analyzers + rules',
    free: '✓',
    starter: '✓',
    pro: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Evidence explorer — drill to the raw response',
    free: '✓',
    starter: '✓',
    pro: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Projects',
    free: '1',
    starter: '3',
    pro: '15',
    enterprise: 'Unlimited',
  },
  {
    dimension: 'Seats',
    free: '1',
    starter: '3',
    pro: '10',
    enterprise: 'Unlimited',
  },
  {
    dimension: 'Site health crawl mode',
    free: 'Sample — deterministic, seeded, read-only',
    starter: 'Full progressive inventory',
    pro: 'Full progressive inventory',
    enterprise: 'Full progressive inventory',
  },
  {
    // Free/Starter capability shape is grounded in docs/site-health.md's
    // entitlement table; the quota sizes are the published commercial terms.
    dimension: 'Monitored URL set',
    free: '—',
    starter: '100 URLs',
    pro: '1,000 URLs',
    enterprise: 'Custom',
  },
  {
    dimension: 'Run history retention',
    free: '30 days',
    starter: '12 months',
    pro: 'Unlimited',
    enterprise: 'Unlimited',
  },
  {
    dimension: 'Competitor benchmarking + cross-run trends',
    free: '—',
    starter: '—',
    pro: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Authenticated CSV + Markdown exports',
    free: '—',
    starter: '✓',
    pro: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Self-hosted deployment',
    free: '—',
    starter: '—',
    pro: '—',
    enterprise: '✓',
  },
  {
    dimension: 'Support',
    free: 'Docs and community',
    starter: 'Email',
    pro: 'Priority email',
    enterprise: 'Named contact',
  },
];
