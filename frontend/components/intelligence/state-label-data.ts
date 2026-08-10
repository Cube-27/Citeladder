export const DERIVED_STATES = [
  'unknown',
  'unavailable',
  'not_applicable',
  'historical',
  'future',
  'conflicting',
  'excluded',
  'failed',
  'observed_zero',
] as const;

export type DerivedState = (typeof DERIVED_STATES)[number];

export const STATE_COPY: Record<DerivedState, { label: string; description: string }> = {
  unknown: {
    label: 'Unknown',
    description: 'Not yet determined. No observation has been attempted.',
  },
  unavailable: {
    label: 'Unavailable',
    description: 'Could not be measured — the source did not return a usable value.',
  },
  not_applicable: {
    label: 'Not applicable',
    description: 'This measure does not apply to this artifact.',
  },
  historical: {
    label: 'Historical',
    description: 'Was true in an earlier period and is not asserted as current.',
  },
  future: {
    label: 'Scheduled',
    description: 'Takes effect at a future date and is not current.',
  },
  conflicting: {
    label: 'Conflicting',
    description: 'Sources disagree. No single value is asserted.',
  },
  excluded: {
    label: 'Excluded',
    description: 'Deliberately outside the analyzed scope.',
  },
  failed: {
    label: 'Failed',
    description: 'The attempt ran and did not complete.',
  },
  observed_zero: {
    label: 'Zero observed',
    description: 'Measured successfully. The observed value is zero.',
  },
};

export function stateLabel(state: DerivedState): string {
  return STATE_COPY[state].label;
}
