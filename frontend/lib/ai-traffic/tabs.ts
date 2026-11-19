/** The AI traffic page's tabs in row order. Data only: the route manifest loads it in Node. */
export const TRAFFIC_TABS = [
  { value: 'overview', label: 'Overview', crawlOnly: false },
  { value: 'crawlers', label: 'Crawlers', crawlOnly: true },
  { value: 'referrals', label: 'Referrals', crawlOnly: false },
  { value: 'pages', label: 'Pages', crawlOnly: false },
  { value: 'activity', label: 'Activity', crawlOnly: true },
] as const;
/** Views that show crawl logs alone; they are dropped when collection is unavailable. */
export const CRAWL_ONLY_TABS: ReadonlySet<string> = new Set(
  TRAFFIC_TABS.filter((t) => t.crawlOnly).map((t) => t.value),
);
