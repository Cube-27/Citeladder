/** Context's tabs in row order. Data only: the route manifest loads it in Node. */
export const CONTEXT_TABS = [
  // Short labels: six tabs fit the compact column on one row.
  { value: 'facts', label: 'Company' },
  { value: 'audience', label: 'Audience' },
  { value: 'map', label: 'Business map' },
  { value: 'competitors', label: 'Competitors' },
  { value: 'instructions', label: 'Instructions' },
  // Last, and only once the pilot gate answers: it joins the end of the row,
  // so its arrival moves no other tab.
  { value: 'brand-facts', label: 'Brand facts' },
] as const;

export type ContextTab = (typeof CONTEXT_TABS)[number]['value'];
