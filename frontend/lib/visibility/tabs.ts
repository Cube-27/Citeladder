/**
 * The Sources page tabs, in display order. `domains` is the default.
 *   - domains:        the domains AI answers retrieved and cited
 *   - urls:           the cited pages
 *   - read-not-cited: your pages an engine read and still did not cite
 *   - query-fanout:   frozen prompts + generated search-query evidence
 *   - ads:            paid ads shown in ChatGPT Search answers, apart from sources
 *
 * Every tab reads the selected measurement, so the run / engine / prompt /
 * period controls apply throughout and there is no per-tab exception.
 * Data only: the route manifest loads it in Node.
 */
export const VISIBILITY_TABS = [
  // NOTE: `id` is the persisted `?tab=` URL value — only labels are restyled.
  { id: 'domains', label: 'Domains' },
  { id: 'urls', label: 'URLs' },
  { id: 'read-not-cited', label: 'Read, not cited' },
  { id: 'query-fanout', label: 'Query fanouts' },
  { id: 'ads', label: 'Ads' },
] as const;

export type VisibilityTab = (typeof VISIBILITY_TABS)[number]['id'];
