export const SITE_HEALTH_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'pages', label: 'Pages' },
  { value: 'internal-links', label: 'Internal links' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'changes', label: 'Changes' },
] as const;

export type SiteHealthTab = (typeof SITE_HEALTH_TABS)[number]['value'];
