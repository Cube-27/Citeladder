import type { CompetitorCandidate } from '@citeladder/contracts/commerce-suite';

import type { StatusTone } from '@/components/ui/status-mark';

const FAILURES: Record<string, (kind: string) => string> = {
  unusable_target: (kind) => `This ${kind} needs a clearer name before competitors can be found.`,
  provider_unavailable: () =>
    'Competitor discovery is unavailable: no search provider is configured.',
  provider_failed: () => 'The search provider did not respond. Try again later.',
  commerce_target_unavailable: (kind) => `This ${kind} is no longer in the catalog.`,
};

export function discoveryMessage(status: string, kind: string, errorCode: string): string {
  if (status === 'succeeded') return `Discovery finished for this ${kind}.`;
  if (status === 'cancelled') return `Discovery was cancelled for this ${kind}.`;
  if (status === 'failed')
    return FAILURES[errorCode]?.(kind) ?? `Discovery failed for this ${kind}. Try again later.`;
  return `Finding competitors for this ${kind}…`;
}

export function competitorHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const COMPETITOR_STATES: Record<CompetitorCandidate['state'], { tone: StatusTone; label: string }> =
  {
    approved: { tone: 'positive', label: 'Approved' },
    rejected: { tone: 'negative', label: 'Rejected' },
    excluded: { tone: 'negative', label: 'Excluded' },
    pending: { tone: 'info', label: 'Needs review' },
  };

export function competitorState(state: CompetitorCandidate['state']) {
  return COMPETITOR_STATES[state];
}
