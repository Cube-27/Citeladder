/**
 * Product-page copy for /platform and its capabilities. Published paths and
 * labels belong to nav.ts; this module owns what each page says.
 *
 * Availability statements here are deliberate: the public trial is a limited
 * ChatGPT visibility entry point, the Agent is outside it, Commerce depends on
 * project eligibility, MCP changes happen only when allowed and confirmed by
 * the user, and paid research is confirmed per collection. Keep claims inside those boundaries.
 */

import type { FaqItem } from './faq';

/**
 * Which product screen illustrates a page or feature: one of the website's
 * screens (`components/marketing/screens`). A page never shows one twice.
 */
export type PlatformScreen =
  | 'visibility'
  | 'prompts'
  | 'engines'
  | 'answer'
  | 'perception'
  | 'sources'
  | 'cited-url'
  | 'referrals'
  | 'commerce'
  | 'site-health'
  | 'crawler-access'
  | 'demand'
  | 'keywords'
  | 'actions'
  | 'agent-chat'
  | 'agent-brief'
  | 'mcp'
  | 'integrations';

/**
 * How a feature is shown: its copy beside its screen (`split`), its screen
 * full width under the copy (`full`), or a card, with or without a screen,
 * set in a row with the cards next to it (`card`).
 */
type PlatformFeatureMedia =
  | { kind: 'split'; screen: PlatformScreen }
  | { kind: 'full'; screen: PlatformScreen }
  | { kind: 'card'; screen?: PlatformScreen };

/** Which primary action a page leads with. */
export type PlatformCta = 'trial' | 'demo' | 'mcp' | 'setup';

type PlatformFeature = {
  title: string;
  body: string;
  points: readonly string[];
  media: PlatformFeatureMedia;
};

export type PlatformPage = {
  path: string;
  title: string;
  description: string;
  heading: string;
  lead: string;
  cta: PlatformCta;
  /** The hero's screen. */
  screen: PlatformScreen;
  highlights: readonly { title: string; body: string }[];
  features: readonly PlatformFeature[];
  /** How a team gets from setup to a result, in order. */
  steps: readonly { title: string; body: string }[];
  /** Questions a team can answer with this capability, phrased as they would ask them. */
  questions: readonly string[];
  /** Plain availability statement shown under the hero actions. */
  note?: string;
  /** Rendered on the page and mirrored as FAQPage structured data. */
  faqs: readonly FaqItem[];
  closing: string;
  related: readonly string[];
};

export const TRIAL_NOTE = '7-day free trial on ChatGPT answers. Trial limits apply.';
export const AGENT_NOTE = 'The Agent is not part of the free trial. Book a demo to try it.';
