/**
 * Single source of truth for the demand-signal taxonomy.
 *
 * Signal grouping was previously written out three times (filter tabs, tab
 * counts, KPI cards), each free to drift from the others. Every grouping,
 * label, and metric read now derives from the maps here.
 */
import { agentHandoffHref } from '@/lib/agent/handoff';
import type { DemandSignal } from '@/lib/api/demand';
import { parseAbsoluteHttpUrl } from '@/lib/safe-http-url';

type SignalType =
  | 'striking_distance'
  | 'query_cannibalization'
  | 'property_relative_ctr_gap'
  | 'high_impression_low_ctr'
  | 'emerging_query'
  | 'declining_query'
  | 'branded_query_performance';

export type FilterTab =
  | 'all'
  | 'striking_distance'
  | 'cannibalization'
  | 'ctr_gap'
  | 'trends'
  | 'branded';

/** Which signal types each filter tab admits. `all` admits everything. */
const SIGNAL_GROUPS: Readonly<Record<Exclude<FilterTab, 'all'>, readonly SignalType[]>> = {
  striking_distance: ['striking_distance'],
  cannibalization: ['query_cannibalization'],
  ctr_gap: ['property_relative_ctr_gap', 'high_impression_low_ctr'],
  trends: ['emerging_query', 'declining_query'],
  branded: ['branded_query_performance'],
};

/** Tab order and labels for the filter bar. */
export const FILTER_TABS: readonly { tab: FilterTab; label: string }[] = [
  { tab: 'all', label: 'All Signals' },
  { tab: 'striking_distance', label: 'Striking Distance' },
  { tab: 'cannibalization', label: 'Cannibalization' },
  { tab: 'ctr_gap', label: 'CTR Gaps' },
  { tab: 'trends', label: 'Emerging / Declining' },
  { tab: 'branded', label: 'Branded Cohort' },
];

type SignalTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

/**
 * Each signal type's chip label and its one-sentence definition. The screen
 * explains a type once, in its legend, rather than repeating prose per row.
 */
const SIGNAL_TYPE_META: Readonly<
  Record<SignalType, { label: string; tone: SignalTone; definition: string }>
> = {
  striking_distance: {
    label: 'Striking distance',
    tone: 'info',
    definition:
      'Ranks close enough to the top results that better coverage can lift it into the positions that earn clicks.',
  },
  query_cannibalization: {
    label: 'Cannibalization',
    tone: 'warning',
    definition: 'More than one of your pages ranks for the query, splitting its impressions.',
  },
  property_relative_ctr_gap: {
    label: 'CTR gap',
    tone: 'danger',
    definition: 'Clicked less often than results at the same position across your property.',
  },
  high_impression_low_ctr: {
    label: 'Low CTR',
    tone: 'danger',
    definition: 'Earns many impressions but few clicks for its ranking.',
  },
  emerging_query: {
    label: 'Emerging',
    tone: 'success',
    definition: 'Impressions rose across the last two 14-day windows.',
  },
  declining_query: {
    label: 'Declining',
    tone: 'danger',
    definition: 'Impressions fell across the last two 14-day windows.',
  },
  branded_query_performance: {
    label: 'Branded',
    tone: 'neutral',
    definition:
      'Navigational demand for your brand, tracked apart so it cannot skew the gap analysis.',
  },
};

const FALLBACK_TYPE_META = {
  label: 'Demand signal',
  tone: 'neutral' as SignalTone,
  definition: 'A Search Console gap identified by demand analysis.',
};

export function signalTypeMeta(signalType: string) {
  return (
    (SIGNAL_TYPE_META as Record<string, typeof FALLBACK_TYPE_META>)[signalType] ??
    FALLBACK_TYPE_META
  );
}

export function matchesTab(signal: DemandSignal, tab: FilterTab): boolean {
  if (tab === 'all') return true;
  return (SIGNAL_GROUPS[tab] as readonly string[]).includes(signal.signal_type);
}

export function countByTab(signals: readonly DemandSignal[], tab: FilterTab): number {
  return signals.reduce((total, signal) => total + (matchesTab(signal, tab) ? 1 : 0), 0);
}

/** Branded demand is navigational, so it is excluded from every gap rollup. */
export function isActionableGap(signal: DemandSignal): boolean {
  return signal.signal_type !== 'branded_query_performance';
}

/**
 * A metric value, or `null` when the backend did not observe one. Callers must
 * decide how an unobserved metric renders — this never invents a zero.
 */
export function numericMetric(signal: DemandSignal, key: string): number | null {
  const value = signal.metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The human-facing subject of a signal, tolerant of a non-string `target`. */
export function signalTarget(signal: DemandSignal): string {
  const target = signal.evidence.target;
  if (typeof target === 'string' && target.trim()) return target;
  return signal.topic_cluster || signal.page_url || '';
}

export function signalTargetKind(signal: DemandSignal): 'Page' | 'Query' {
  return signal.evidence.target_kind === 'page' ? 'Page' : 'Query';
}

/**
 * `signal.page_url` as a link target, or `null` when it is not a safe absolute
 * web URL.
 *
 * Stricter than the Markdown sanitiser in `lib/markdown/safe-url`: a demand
 * page URL is always an absolute address observed by the crawler, so relative
 * and `mailto:` values are rejected here rather than allowed. The value
 * ultimately originates from third-party Search Console data, so it is never
 * put in an `href` unvalidated.
 */
export function safePageUrl(pageUrl: string | null | undefined): string | null {
  return parseAbsoluteHttpUrl(pageUrl) ? pageUrl!.trim() : null;
}

export type CompetingPage = { url: string; impressions: number; share: number };

/**
 * Competing URLs from cannibalization evidence, or `[]` when absent.
 *
 * `evidence` is `Record<string, unknown>`, so every field is validated: a page
 * missing `impressions`/`share` would otherwise reach `.toLocaleString()` and
 * `.toFixed()` on `undefined` at render time.
 */
export function competingPages(signal: DemandSignal): CompetingPage[] {
  const pages = signal.evidence.pages;
  if (!Array.isArray(pages)) return [];
  return pages.filter((page): page is CompetingPage => {
    if (typeof page !== 'object' || page === null) return false;
    const { url, impressions, share } = page as Partial<CompetingPage>;
    return (
      typeof url === 'string' &&
      typeof impressions === 'number' &&
      Number.isFinite(impressions) &&
      typeof share === 'number' &&
      Number.isFinite(share)
    );
  });
}

export type DetectorState = { state?: string; limitations?: string[] };

/**
 * `summary.detectors` is `unknown` on the wire — read it defensively.
 *
 * Each entry is normalised so consumers can rely on the shape: `limitations`
 * is always an array of strings (callers `.join()` it), and a non-string
 * `state` is dropped so it falls through to the caller's default.
 */
export function detectorStates(summary: Record<string, unknown>): Record<string, DetectorState> {
  const detectors = summary.detectors;
  if (!detectors || typeof detectors !== 'object' || Array.isArray(detectors)) return {};

  const normalised: Record<string, DetectorState> = {};
  for (const [key, value] of Object.entries(detectors as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const { state, limitations } = value as { state?: unknown; limitations?: unknown };
    normalised[key] = {
      state: typeof state === 'string' ? state : undefined,
      limitations: Array.isArray(limitations)
        ? limitations.filter((item): item is string => typeof item === 'string')
        : [],
    };
  }
  return normalised;
}

/**
 * Ask agent about one signal: its id travels as a typed reference the server
 * resolves, and its page (when it is a safe URL) as the chat's target.
 */
export function demandSignalHandoffHref(signal: DemandSignal): string {
  const target = signalTarget(signal);
  const subject = target ? ` for "${target}"` : '';
  return agentHandoffHref({
    demandSignalId: signal.id,
    targetUrl: safePageUrl(signal.page_url),
    prompt: `Help me act on this Search Console demand signal${subject}.`,
  });
}

export type RankedSignal = { signal: DemandSignal; rank: number };
export type PageGroup = { page: string | null; rows: RankedSignal[] };

/**
 * The page a signal is about: its own target for a page signal, the resolved
 * landing page for a query signal, or null when none was resolved.
 */
function signalPage(signal: DemandSignal): string | null {
  if (signalTargetKind(signal) === 'Page') return signalTarget(signal) || null;
  return signal.page_url.trim() || null;
}

/** Rows grouped by page, in the order each page's best signal ranks. */
export function groupByPage(rows: readonly RankedSignal[]): PageGroup[] {
  const groups = new Map<string | null, RankedSignal[]>();
  for (const row of rows) {
    const page = signalPage(row.signal);
    groups.set(page, [...(groups.get(page) ?? []), row]);
  }
  return [...groups].map(([page, grouped]) => ({ page, rows: grouped }));
}

export type ActionGroup = { actionId: string; page: string; signalTypes: string[] };

/**
 * Promoted signals, one entry per Action they were grouped into, in priority
 * order. Signals on one page share its Action, so this is grouped by page.
 */
export function actionGroups(signals: readonly DemandSignal[]): ActionGroup[] {
  const groups = new Map<string, ActionGroup>();
  for (const signal of signals) {
    if (!signal.action_id) continue;
    const group = groups.get(signal.action_id) ?? {
      actionId: signal.action_id,
      page: signalPage(signal) ?? signalTarget(signal),
      signalTypes: [],
    };
    if (!group.signalTypes.includes(signal.signal_type)) group.signalTypes.push(signal.signal_type);
    groups.set(signal.action_id, group);
  }
  return [...groups.values()];
}
