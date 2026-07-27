/** Published catalog shared by the pricing cards and comparison table. */

import { DEMO_HREF } from './nav';

export type PricingTableRow = {
  dimension: string;
  free: string;
  paid: string;
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

export const PRICING_NOTE =
  'Audits use your own provider keys. Paid is $49/month before applicable tax: India is charged through a fixed INR Razorpay plan with GST added; international cards are charged in USD and the card issuer may convert that amount.';

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'to start',
    blurb: 'Start with the core evidence workflow.',
    cta: { label: 'Start free', href: '/register' },
    features: [
      'Bring your own ChatGPT, Gemini, and Claude keys',
      'Deterministic visibility evidence',
      'Site Health sample crawl',
      'No Razorpay subscription required',
    ],
  },
  {
    key: 'paid',
    name: 'Paid',
    price: '$49',
    cadence: 'per month',
    blurb: 'Recurring site monitoring, web-search-grounded audits, and the full Site Health inventory.',
    cta: { label: 'Choose Paid', href: '/register' },
    highlighted: true,
    primaryCta: true,
    features: [
      'Everything in Free, plus:',
      'Full Site Health inventory and monitored URLs',
      'Web-search-grounded audits',
      'Authenticated CSV + Markdown exports',
      'India: fixed INR price with GST added',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'sales-assisted agreement',
    blurb: 'Custom volume, security review, and deployment options.',
    cta: { label: 'Book a demo', href: DEMO_HREF },
    features: [
      'Custom projects, seats, volume, and retention',
      'Managed cloud operated by CUBE27 — you keep your own provider keys',
      'Security review and a named contact',
      'Commercial terms agreed with sales',
    ],
  },
];

export const PRICING_TABLE_ROWS: readonly PricingTableRow[] = [
  {
    dimension: 'Three-engine audits — ChatGPT · Gemini · Claude',
    free: '✓',
    paid: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Your own provider keys — encrypted at rest',
    free: '✓',
    paid: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Deterministic scoring and evidence explorer',
    free: '✓',
    paid: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Site health crawl mode',
    free: 'Sample — deterministic and read-only',
    paid: 'Full progressive inventory',
    enterprise: 'Custom',
  },
  {
    dimension: 'User-selected monitored URLs',
    free: '—',
    paid: '✓',
    enterprise: 'Custom',
  },
  {
    dimension: 'Web-search-grounded audits',
    free: '—',
    paid: '✓',
    enterprise: 'Custom',
  },
  {
    dimension: 'Authenticated exports',
    free: '—',
    paid: '✓',
    enterprise: '✓',
  },
  {
    dimension: 'Support',
    free: 'Public FAQ',
    paid: 'Email',
    enterprise: 'Named contact',
  },
];
