/** Perception's tabs in row order. Data only: the route manifest loads it in Node. */
export const PERCEPTION_TABS = [
  { value: 'brand', label: 'Brand' },
  // The pilot's only; the page owns the gate.
  { value: 'fact-checking', label: 'Fact-checking' },
] as const;

export type PerceptionTab = (typeof PERCEPTION_TABS)[number]['value'];
