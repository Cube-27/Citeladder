/**
 * Pricing PRESENTATION metadata.
 *
 * The approved launch prices, plan features, and comparison rows live here
 * temporarily while the matching persisted catalog revision is implemented.
 * Checkout availability and purchasing still come from `GET /billing/catalog`.
 *
 * A component that cannot reach the catalog renders a loading or error shell.
 */

/** Where the contact-only tier sends people when the catalog gives no URL. */
/** The backend's plan keys, as the presentation layer refers to them. */
export type PlanKey = 'tier_1' | 'tier_2' | 'tier_3' | 'enterprise';

export type PlanPresentation = {
  blurb: string;
  highlighted?: boolean;
};

export type PricingMode = 'byok' | 'funded';
export type PricingCurrency = 'USD' | 'INR';
type LaunchComparisonValue = boolean | number | string;

type LaunchPlan = {
  prices: Record<PricingCurrency, Record<PricingMode, number>>;
  projects: number;
  prompts: number;
  monitoredUrls: number;
  pageFetches: number;
  history: string;
  manualRuns: number;
  answers: number;
  aiCredits: number;
  fanout: boolean;
  contentCreation: boolean;
  growthAgent: boolean;
};

const LAUNCH_PLANS: Readonly<Record<Exclude<PlanKey, 'enterprise'>, LaunchPlan>> = {
  tier_1: {
    prices: { USD: { funded: 9900, byok: 4900 }, INR: { funded: 899900, byok: 449900 } },
    projects: 1,
    prompts: 10,
    monitoredUrls: 50,
    pageFetches: 500,
    history: '90 days',
    manualRuns: 3,
    answers: 1000,
    aiCredits: 0,
    fanout: false,
    contentCreation: false,
    growthAgent: false,
  },
  tier_2: {
    prices: { USD: { funded: 24900, byok: 9900 }, INR: { funded: 2249900, byok: 899900 } },
    projects: 3,
    prompts: 30,
    monitoredUrls: 150,
    pageFetches: 1500,
    history: '12 months',
    manualRuns: 6,
    answers: 3000,
    aiCredits: 500,
    fanout: true,
    contentCreation: true,
    growthAgent: true,
  },
  tier_3: {
    prices: { USD: { funded: 49900, byok: 19900 }, INR: { funded: 4499900, byok: 1799900 } },
    projects: 10,
    prompts: 60,
    monitoredUrls: 400,
    pageFetches: 4000,
    history: '24 months',
    manualRuns: 12,
    answers: 6000,
    aiCredits: 1500,
    fanout: true,
    contentCreation: true,
    growthAgent: true,
  },
};

export function launchPlanPrice(
  key: PlanKey,
  currency: PricingCurrency,
  mode: PricingMode,
): number | null {
  if (key === 'enterprise') return null;
  return LAUNCH_PLANS[key].prices[currency][mode];
}

export function launchPlanCardFeatures(
  key: PlanKey,
  mode: PricingMode,
): ReadonlyArray<Readonly<{ label: string; value: string }>> {
  if (key === 'enterprise') {
    return [
      { label: 'Projects', value: 'Custom' },
      { label: 'Prompts', value: 'Custom' },
      { label: 'Monitored URLs', value: 'Custom' },
      { label: 'Measurement volume', value: 'Custom' },
      { label: 'Workflow support', value: 'Custom' },
    ];
  }
  const plan = LAUNCH_PLANS[key];
  return [
    { label: 'Projects', value: String(plan.projects) },
    { label: 'Prompts', value: String(plan.prompts) },
    { label: 'Monitored URLs', value: String(plan.monitoredUrls) },
    {
      label: mode === 'funded' ? 'Managed answers' : 'Visibility runs',
      value: mode === 'funded' ? `${plan.answers.toLocaleString()}/month` : 'Your keys',
    },
    {
      label: 'Content + Growth Agent',
      value: plan.contentCreation && plan.growthAgent ? 'Included' : '—',
    },
  ];
}

export type LaunchComparisonRow = {
  label: string;
  values: Readonly<Record<PlanKey, LaunchComparisonValue>>;
};

export function launchComparisonRows(mode: PricingMode): ReadonlyArray<LaunchComparisonRow> {
  const starter = LAUNCH_PLANS.tier_1;
  const growth = LAUNCH_PLANS.tier_2;
  const scale = LAUNCH_PLANS.tier_3;
  const row = (
    label: string,
    values: readonly [LaunchComparisonValue, LaunchComparisonValue, LaunchComparisonValue],
  ): LaunchComparisonRow => ({
    label,
    values: { tier_1: values[0], tier_2: values[1], tier_3: values[2], enterprise: 'Custom' },
  });

  return [
    row('Projects', [starter.projects, growth.projects, scale.projects]),
    row('Prompts', [starter.prompts, growth.prompts, scale.prompts]),
    row('Monitored URLs', [starter.monitoredUrls, growth.monitoredUrls, scale.monitoredUrls]),
    row('Site Health page fetches / month', [
      starter.pageFetches,
      growth.pageFetches,
      scale.pageFetches,
    ]),
    row('History', [starter.history, growth.history, scale.history]),
    row('Manual runs / day', [starter.manualRuns, growth.manualRuns, scale.manualRuns]),
    row(
      'Managed answers / month',
      mode === 'funded' ? [starter.answers, growth.answers, scale.answers] : [0, 0, 0],
    ),
    row('Workflow AI credits / month', [starter.aiCredits, growth.aiCredits, scale.aiCredits]),
    row('AI engines', [
      'ChatGPT, Claude, Gemini',
      'ChatGPT, Claude, Gemini',
      'ChatGPT, Claude, Gemini',
    ]),
    row('Daily tracking', [true, true, true]),
    row('Weekly Site Health refresh', [true, true, true]),
    row('Competitors / project', [5, 5, 5]),
    row('Query fan-out', [starter.fanout, growth.fanout, scale.fanout]),
    row('Content creation', [
      starter.contentCreation,
      growth.contentCreation,
      scale.contentCreation,
    ]),
    row('Growth Agent', [starter.growthAgent, growth.growthAgent, scale.growthAgent]),
    row('AI visibility analytics', [true, true, true]),
    row('Mentions, citations + source tracking', [true, true, true]),
    row('Trends + competitor comparison', [true, true, true]),
    row('Site Health + AEO readiness', [true, true, true]),
    row('Opportunity detection + recommendations', [true, true, true]),
    row('GSC properties / project', [1, 1, 1]),
    row('GA4 properties / project', [1, 1, 1]),
    row('CSV exports', [true, true, true]),
    row('MCP access', [true, true, true]),
    row('Mobile access', [true, true, true]),
    row('Invoice + receipt downloads', [true, true, true]),
    row('Support', ['Email', 'Email', 'Priority email']),
  ];
}

/**
 * Copy keyed by the exact backend plan key. A key the backend stops sending
 * simply stops rendering; a key with no entry here falls back to the catalog's
 * own description.
 */
export const PLAN_PRESENTATION: Readonly<Record<PlanKey, PlanPresentation>> = {
  tier_1: {
    blurb: 'Daily AI visibility tracking for one brand.',
  },
  tier_2: {
    blurb: 'Add content creation and the Growth Agent to your workflow.',
    highlighted: true,
  },
  tier_3: { blurb: 'Higher limits and priority support for expanding teams.' },
  enterprise: {
    blurb: 'Custom scale and evidence-workflow support.',
  },
};

/** The label on the credential-mode switch. */
export const BYOK_SWITCH_LABEL = 'Use your own API keys';

/**
 * The full BYOK disclosure, shown beside the switch.
 *
 * Both halves matter: customers pay their providers directly, AND their own
 * rate limits govern how fast a report can be produced. Promising report-ready
 * latency on someone else's quota would be a promise we cannot keep.
 */
export const BYOK_DISCLOSURE =
  'Provider usage is billed directly to your accounts with no CiteLadder markup. ' +
  'Run speed depends on your providers’ rate limits.';

/** Fallback for a malformed or stale catalog response without a plan price. */
export const FUNDED_UNAVAILABLE_LABEL = 'Not yet priced';

/** Shown for a contact-only tier. */
export const CONTACT_LABEL = 'Contact us';

/** Human labels for the capability keys the comparison grid renders. */
const CAPABILITY_LABELS: Readonly<Record<string, string>> = {
  project_slots: 'Projects',
  prompt_slots: 'Prompts',
  monitored_urls: 'Monitored URLs',
  manual_runs_per_day: 'Manual runs per day',
  audit_credits: 'Audit credits',
  audit_cadence: 'Audit frequency',
  audit_web_search: 'Web-search-grounded audits',
  authenticated_exports: 'Authenticated exports',
};

/**
 * `prompt_slots` → `Prompt slots` when no explicit label is registered.
 *
 * The lookup is an OWN-property check: the keys come from the billing API, and
 * a plain-object map answers `__proto__`/`toString` from the prototype chain
 * with a non-string, which React cannot render as a child.
 */
export function capabilityLabel(key: string): string {
  if (Object.hasOwn(CAPABILITY_LABELS, key)) return CAPABILITY_LABELS[key];
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
