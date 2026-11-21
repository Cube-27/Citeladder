import type { PlanCatalogKey as PlanKey } from '@citeladder/contracts/billing';
import { ownValue } from '@/lib/utils';

export type PlanPresentation = {
  blurb: string;
  highlighted?: boolean;
};

export const PLAN_PRESENTATION: Readonly<Record<PlanKey, PlanPresentation>> = {
  tier_1: { blurb: 'Daily AI visibility tracking for one brand.' },
  tier_2: {
    blurb: 'Adds the Agent, which drafts briefs and page edits from your project data.',
    highlighted: true,
  },
  tier_3: { blurb: 'Higher limits and priority support for growing teams.' },
  enterprise: { blurb: 'Custom limits and support for your team’s workflows.' },
};

export const BYOK_SWITCH_LABEL = 'Use your own API keys';
export const BYOK_ON_ANNOUNCEMENT = 'Showing prices for using your own API keys.';
export const BYOK_OFF_ANNOUNCEMENT = 'Showing prices with provider usage included.';
export const BYOK_DISCLOSURE =
  'Provider usage is billed directly to your accounts with no CiteLadder markup. ' +
  "Run speed depends on your providers' rate limits.";

const CAPABILITY_LABELS: Readonly<Record<string, string>> = {
  project_slots: 'Projects',
  prompt_slots: 'Prompts',
  monitored_urls: 'Monitored URLs',
  manual_runs_per_day: 'Manual runs per day',
  prompt_runs_per_period: 'Prompt runs per month',
  agent: 'Agent',
  crawl_logs: 'AI crawler logs',
  api_access: 'REST API access',
  api_keys: 'API keys',
  market_slots: 'Additional markets',
  ai_credits: 'AI credits',
  commerce: 'Commerce',
  search_intelligence: 'Keyword research',
};

export function capabilityLabel(key: string): string {
  const known = ownValue(CAPABILITY_LABELS, key);
  if (known !== undefined) return known;
  const words = key.replaceAll('_', ' ').replaceAll('.', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
