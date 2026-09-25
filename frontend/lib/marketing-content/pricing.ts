/** Public pricing copy. Amounts, limits and availability come from the catalog. */
export type PlanKey = 'tier_1' | 'tier_2' | 'tier_3' | 'enterprise';

export type PlanPresentation = {
  blurb: string;
  highlighted?: boolean;
};

export const PLAN_PRESENTATION: Readonly<Record<PlanKey, PlanPresentation>> = {
  tier_1: { blurb: 'Daily AI visibility tracking for one brand.' },
  tier_2: {
    blurb: 'Add the Agent and its content skills to your workflow.',
    highlighted: true,
  },
  tier_3: { blurb: 'Higher limits and priority support for expanding teams.' },
  enterprise: { blurb: 'Custom scale and evidence-workflow support.' },
};

export const BYOK_SWITCH_LABEL = 'Use your own API keys';
export const BYOK_DISCLOSURE =
  'Provider usage is billed directly to your accounts with no CiteLadder markup. ' +
  'Run speed depends on your providers’ rate limits.';

const CAPABILITY_LABELS: Readonly<Record<string, string>> = {
  project_slots: 'Projects',
  prompt_slots: 'Prompts',
  monitored_urls: 'Monitored URLs',
  manual_runs_per_day: 'Manual runs per day',
  audit_credits: 'Audit credits',
  audit_cadence: 'Audit frequency',
  audit_web_search: 'Web-search-grounded audits',
  authenticated_exports: 'Authenticated exports',
  // The merged Agent capability keeps its persisted key until a billing
  // migration retires it.
  growth_agent: 'Agent',
};

export function capabilityLabel(key: string): string {
  if (Object.hasOwn(CAPABILITY_LABELS, key)) return CAPABILITY_LABELS[key];
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
