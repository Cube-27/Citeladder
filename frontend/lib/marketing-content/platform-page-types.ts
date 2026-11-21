import type { FaqItem } from './faq';

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
  | 'content-optimization'
  | 'agent-chat'
  | 'agent-brief'
  | 'mcp'
  | 'integrations';

type PlatformFeatureMedia =
  | { kind: 'split'; screen: PlatformScreen }
  | { kind: 'full'; screen: PlatformScreen }
  | { kind: 'card' };

export type PlatformCta = 'trial' | 'demo' | 'mcp' | 'setup';

type PlatformFeature = {
  title: string;
  body: string;
  points: readonly string[];
  media: PlatformFeatureMedia;
};

export type PlatformPage = {
  path: string;
  updated: string;
  title: string;
  description: string;
  heading: string;
  lead: string;
  cta: PlatformCta;
  screen: PlatformScreen;
  highlights: readonly { title: string; body: string }[];
  features: readonly PlatformFeature[];
  steps: readonly { title: string; body: string }[];
  questions: readonly string[];
  note?: string;
  faqs: readonly FaqItem[];
  closing: string;
  related: readonly string[];
};

export const TRIAL_NOTE = '7-day free trial on ChatGPT answers. Trial limits apply.';
export const AGENT_NOTE = 'The Agent is not part of the free trial. Book a demo to try it.';
