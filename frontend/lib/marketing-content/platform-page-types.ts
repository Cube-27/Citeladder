/**
 * Product-page copy for /platform and its capabilities. Published paths and
 * labels belong to nav.ts; this module owns what each page says.
 *
 * Availability statements here are deliberate: the public trial is a limited
 * ChatGPT visibility entry point, the Agent is outside it, Commerce depends on
 * project eligibility, MCP is read-only, and paid research is confirmed per
 * collection. Keep claims inside those boundaries.
 */

/** Which coded product view illustrates a page or feature. */
export type PlatformVisual =
  | 'visibility'
  | 'answer'
  | 'sources'
  | 'site-health'
  | 'referrals'
  | 'demand'
  | 'search'
  | 'agent'
  | 'commerce'
  | 'mcp'
  | 'integrations'
  | 'actions'
  | 'prompts'
  | 'cited-url'
  | 'page-evidence'
  | 'page-report'
  | 'query-page'
  | 'acquisition'
  | 'revisions'
  | 'skills'
  | 'shelf-setup'
  | 'mcp-tools'
  | 'property-mapping';

/** Which primary action a page leads with. */
export type PlatformCta = 'trial' | 'demo' | 'mcp' | 'setup';

type PlatformFeature = {
  title: string;
  body: string;
  points: readonly string[];
  visual: PlatformVisual;
};

export type PlatformPage = {
  path: string;
  title: string;
  description: string;
  heading: string;
  lead: string;
  cta: PlatformCta;
  visual: PlatformVisual;
  visualTitle: string;
  highlights: readonly { title: string; body: string }[];
  features: readonly PlatformFeature[];
  /** Plain availability statement shown under the hero actions. */
  note?: string;
  faqs: readonly { q: string; a: string }[];
  closing: string;
  related: readonly string[];
};

export const TRIAL_NOTE = '7-day free trial on ChatGPT answers. Trial limits apply.';
export const AGENT_NOTE = 'The Agent is not part of the free trial. Book a demo to try it.';
