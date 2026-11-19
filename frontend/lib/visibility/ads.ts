/**
 * Display helpers for ads in AI answers. Values are projected from the read,
 * never recomputed; a missing value stays `null` so the component draws the
 * shared missing mark rather than a zero.
 */
import type {
  AdApplicability,
  AdOwnership,
  AdPresence,
  VisibilityAdsResponse,
} from '@citeladder/contracts/visibility-ads';

import type { ClassificationValue } from '@/components/ui/status-mark';
import { availabilityLabel } from '@/lib/format';
import { parseAbsoluteHttpUrl } from '@/lib/safe-http-url';

export const AD_OWNERSHIP: Record<AdOwnership, { label: string; badge: ClassificationValue }> = {
  owned: { label: 'You', badge: 'owned' },
  competitor: { label: 'Competitor', badge: 'competitor' },
  other: { label: 'Other', badge: 'third-party' },
};

export const AD_APPLICABILITY: Record<AdApplicability, string> = {
  applicable: 'Ads read',
  unavailable: 'Ads unavailable',
  not_applicable: availabilityLabel('not_applicable'),
};

/** "N of M ChatGPT Search answers showed an ad". */
export function presenceLine(presence: AdPresence): string {
  return `${presence.answers_with_ads} of ${presence.answers} ChatGPT Search answers showed an ad`;
}

/** The landing page as host and path; the query string never reaches the read. */
export function landingLabel(url: string): string {
  const parsed = parseAbsoluteHttpUrl(url);
  if (!parsed) return url;
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return `${parsed.host}${path}`;
}

/** The heading for a read that has no ads to show. */
export function adsStateHeading(state: Exclude<VisibilityAdsResponse['state'], 'value'>): string {
  switch (state) {
    case 'not_applicable':
      return AD_APPLICABILITY.not_applicable;
    case 'unavailable':
      return AD_APPLICABILITY.unavailable;
    case 'no_answers':
      return 'No ChatGPT Search answers';
  }
}
