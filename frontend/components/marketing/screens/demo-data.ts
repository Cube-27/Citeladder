import type { BadgeTone } from '@/components/ui/badge';
import type { DeltaPolicy } from '@/components/ui/delta';
import type { EngineKey } from '@/components/ui/engine-mark';

export type Change = Readonly<{
  value: number;
  unit?: string;
  precision?: number;
  policy?: DeltaPolicy;
}>;

const pts = (value: number): Change => ({ value, unit: ' pp' });

export const ENGINE_NAMES: Readonly<Record<EngineKey, string>> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  google: 'Google AI Overviews',
};
export const ENGINE_KEYS: readonly EngineKey[] = ['chatgpt', 'claude', 'gemini', 'google'];

export const WEEKS = ['8 Sep', '15 Sep', '22 Sep', '29 Sep', '6 Oct', '13 Oct', '20 Oct', '27 Oct'];
export const CHECKED = 'Checked today, 06:00 UTC';

export const TREND = {
  acme: [27.9, 29.6, 30.2, 31.8, 32.5, 33.1, 34.2, 38.3],
  northwind: [46.0, 45.2, 45.8, 44.6, 44.1, 43.5, 42.9, 41.7],
  lumen: [30.4, 31.0, 29.8, 30.6, 29.9, 29.2, 28.8, 27.4],
  fathom: [18.1, 17.6, 17.9, 17.2, 17.4, 17.0, 17.1, 17.0],
} as const;

type BrandSentiment = Readonly<
  { kind: 'value'; net: number; classified: number } | { kind: 'too_few'; classified: number }
>;

export type Brand = Readonly<{
  name: string;
  domain: string;
  visibility: number;
  change: Change;
  shareOfVoice: number;
  position: number;
  wins: number;
  mentions: number;
  sentiment: BrandSentiment;
  own?: boolean;
}>;

export const BRANDS: readonly Brand[] = [
  {
    name: 'Northwind',
    domain: 'northwind.io',
    visibility: 41.7,
    change: pts(-1.2),
    shareOfVoice: 33.4,
    position: 1.5,
    wins: 114,
    mentions: 172,
    sentiment: { kind: 'value', net: 38, classified: 151 },
  },
  {
    name: 'Acme Analytics',
    domain: 'acme.com',
    visibility: 38.3,
    change: pts(4.1),
    shareOfVoice: 30.8,
    position: 1.7,
    wins: 92,
    mentions: 158,
    sentiment: { kind: 'value', net: 46, classified: 141 },
    own: true,
  },
  {
    name: 'Lumen',
    domain: 'lumen.app',
    visibility: 27.4,
    change: pts(-1.4),
    shareOfVoice: 22.1,
    position: 1.9,
    wins: 60,
    mentions: 113,
    sentiment: { kind: 'value', net: 12, classified: 97 },
  },
  {
    name: 'Fathom Labs',
    domain: 'fathomlabs.com',
    visibility: 17.0,
    change: pts(-0.1),
    shareOfVoice: 13.7,
    position: 2.1,
    wins: 30,
    mentions: 70,
    sentiment: { kind: 'too_few', classified: 14 },
  },
];

export type Kpi = Readonly<{
  label: string;
  value: string;
  unit?: string;
  change: Change;
  spark: readonly number[];
}>;

export const KPIS: readonly Kpi[] = [
  { label: 'Visibility', value: '38.3', unit: '%', change: pts(4.1), spark: TREND.acme },
  {
    label: 'Share of voice',
    value: '30.8',
    unit: '%',
    change: pts(1.9),
    spark: [26.0, 26.9, 27.3, 27.8, 28.2, 28.5, 28.9, 30.8],
  },
  {
    label: 'Citations',
    value: '212',
    change: { value: 18, precision: 0 },
    spark: [151, 160, 166, 171, 178, 186, 194, 212],
  },
  {
    label: 'Position',
    value: '1.7',
    change: { value: -0.3, policy: 'lower-is-better' },
    spark: [2.5, 2.4, 2.3, 2.2, 2.2, 2.1, 2.0, 1.7],
  },
];

export type EngineRow = Readonly<{
  engine: EngineKey;
  visibility: number;
  change: Change;
  owned: string;
  position: string;
  answers: number;
}>;

export const ENGINE_ROWS: readonly EngineRow[] = (
  [
    ['chatgpt', 44.2, 6.7, '34.2%', '2.3', 120],
    ['claude', 40.0, 5.8, '30.0%', '2.5', 120],
    ['gemini', 30.0, -5.8, '18.3%', '3.4', 120],
    ['google', 40.4, 18.0, '42.3%', '2.4', 52],
  ] as const
).map(([engine, visibility, change, owned, position, answers]) => ({
  engine,
  visibility,
  change: pts(change),
  owned,
  position,
  answers,
}));

export type Source = Readonly<{ index: number; domain: string; title: string; own?: boolean }>;

export const ANSWER_SOURCES: readonly Source[] = [
  { index: 1, domain: 'acme.com', title: '/pricing', own: true },
  { index: 2, domain: 'g2.com', title: '/categories/product-analytics' },
  { index: 3, domain: 'reddit.com', title: '/r/startups' },
  { index: 4, domain: 'northwind.io', title: '/docs/warehouse' },
];

export const CITED_DOMAINS: readonly Readonly<{
  label: string;
  value: number;
  own?: boolean;
  other?: boolean;
}>[] = [
  { label: 'acme.com', value: 212, own: true },
  { label: 'g2.com', value: 168 },
  { label: 'northwind.io', value: 141 },
  { label: 'reddit.com', value: 118 },
  { label: 'capterra.com', value: 87 },
  { label: 'producthunt.com', value: 64 },
  { label: 'lumen.app', value: 59 },
  { label: 'youtube.com', value: 41 },
  { label: 'Other', value: 156, other: true },
];

export const PAGE_RETRIEVALS: readonly Readonly<{
  engine: EngineKey;
  retrievals: number;
  citations: number;
}>[] = [
  { engine: 'chatgpt', retrievals: 52, citations: 31 },
  { engine: 'claude', retrievals: 38, citations: 22 },
  { engine: 'gemini', retrievals: 21, citations: 9 },
  { engine: 'google', retrievals: 17, citations: 12 },
];

export type PromptRow = Readonly<{
  prompt: string;
  topic: string;
  engines: readonly EngineKey[];
  visibility: number;
  owned: number;
  position: string;
  change: number;
}>;

const ALL_ENGINES = ['chatgpt', 'claude', 'gemini', 'google'] as const;

export const PROMPTS: readonly PromptRow[] = (
  [
    [
      'Best product analytics for startups',
      'Tool choice',
      ['chatgpt', 'claude', 'google'],
      75,
      2,
      '2.0',
      25,
    ],
    ['Mixpanel alternatives with a free tier', 'Alternatives', ALL_ENGINES, 100, 3, '1.5', 25],
    ['How to measure feature adoption', 'How-to', ['chatgpt', 'claude'], 50, 2, '3.0', 0],
    ['Cheapest analytics with session replay', 'Pricing', ['claude'], 25, 0, '4.0', -25],
    [
      'Product analytics for a seed-stage startup',
      'Tool choice',
      ['chatgpt', 'claude', 'google'],
      75,
      2,
      '1.3',
      50,
    ],
    [
      'Is Acme Analytics GDPR compliant',
      'Compliance · Branded',
      ['chatgpt', 'claude', 'gemini'],
      100,
      2,
      '1.0',
      0,
    ],
    [
      'Product analytics with EU data residency',
      'Compliance',
      ['chatgpt', 'gemini'],
      50,
      1,
      '2.5',
      25,
    ],
    ['Best funnel analysis tool for SaaS', 'Tool choice', ['chatgpt'], 25, 0, '3.0', 0],
    ['Northwind vs Acme Analytics', 'Alternatives · Branded', ALL_ENGINES, 100, 3, '1.8', 0],
    ['How to set up product analytics in a day', 'How-to', ['claude', 'google'], 50, 1, '2.0', -25],
  ] as const
).map(([prompt, topic, engines, visibility, owned, position, change]) => ({
  prompt,
  topic,
  engines,
  visibility,
  owned,
  position,
  change,
}));

export type Severity = 'High' | 'Medium' | 'Low';

export const FAILED_CHECKS: readonly Readonly<{
  check: string;
  severity: Severity;
  pages: number;
}>[] = [
  { check: 'Search or citation crawlers blocked', severity: 'High', pages: 14 },
  { check: 'Content not present in server HTML', severity: 'High', pages: 3 },
  { check: 'Slow time to first byte', severity: 'Medium', pages: 6 },
  { check: 'Missing structured data', severity: 'Medium', pages: 11 },
  { check: 'Broken internal links', severity: 'Medium', pages: 4 },
  { check: 'Missing meta description', severity: 'Low', pages: 9 },
  { check: 'Missing canonical URL', severity: 'Low', pages: 2 },
];

export type RobotsPolicy = 'All allowed' | 'Restricted';
export const POLICY_TONE: Readonly<Record<RobotsPolicy, BadgeTone>> = {
  'All allowed': 'positive',
  Restricted: 'warning',
};

export const BOTS: readonly Readonly<{
  bot: string;
  operator: string;
  purpose: string;
  policy: RobotsPolicy;
}>[] = [
  { bot: 'GPTBot', operator: 'OpenAI', purpose: 'AI training', policy: 'Restricted' },
  { bot: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'AI search', policy: 'All allowed' },
  { bot: 'ChatGPT-User', operator: 'OpenAI', purpose: 'AI user fetch', policy: 'All allowed' },
  { bot: 'ClaudeBot', operator: 'Anthropic', purpose: 'AI training', policy: 'All allowed' },
  { bot: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'AI search', policy: 'All allowed' },
  { bot: 'Claude-User', operator: 'Anthropic', purpose: 'AI user fetch', policy: 'All allowed' },
  { bot: 'Google-Extended', operator: 'Google', purpose: 'AI training', policy: 'Restricted' },
  { bot: 'PerplexityBot', operator: 'Perplexity', purpose: 'AI search', policy: 'All allowed' },
];

export const KEYWORDS = (
  [
    ['acme analytics', 1, 1300, '/', 403, '2.10', 12, 'Navigational'],
    [
      'feature adoption metrics',
      3,
      1900,
      '/blog/feature-adoption',
      209,
      '4.80',
      38,
      'Informational',
    ],
    [
      'how to measure feature adoption',
      4,
      1000,
      '/blog/feature-adoption',
      82,
      '3.90',
      33,
      'Informational',
    ],
    ['product analytics setup', 6, 720, '/docs/setup', 41, '6.20', 29, 'Informational'],
    ['product analytics for startups', 7, 2400, '/pricing', 96, '11.40', 54, 'Commercial'],
    ['northwind alternatives', 9, 1600, '/compare/northwind', 51, '9.70', 47, 'Commercial'],
    ['mixpanel alternatives', 12, 6600, '/compare/northwind', 79, '13.20', 61, 'Commercial'],
    ['session replay pricing', 18, 880, '/pricing', 9, '8.50', 45, 'Commercial'],
  ] as const
).map(([keyword, position, volume, page, traffic, cpc, difficulty, intent]) => ({
  keyword,
  position,
  volume,
  page,
  traffic,
  cpc,
  difficulty,
  intent,
}));

export const DEMAND_SIGNALS: readonly Readonly<{
  query: string;
  detail: string;
  signal: string;
  figure: string;
}>[] = [
  {
    query: 'product analytics for startups',
    detail: '/pricing · 1,840 impressions',
    signal: 'Striking distance',
    figure: 'Pos. 7.4',
  },
  {
    query: 'mixpanel alternatives',
    detail: '/compare/northwind · median 4.1%',
    signal: 'CTR gap',
    figure: '1.2% CTR',
  },
  {
    query: 'feature adoption metrics',
    detail: '/blog/feature-adoption and /docs/adoption',
    signal: 'Two pages',
    figure: '58% / 34%',
  },
  {
    query: 'session replay pricing',
    detail: '/pricing · last 14 days',
    signal: 'Emerging',
    figure: '+212%',
  },
];

export const WEEKLY_REFERRALS = [300, 320, 335, 354, 410, 440, 480, 516];

export const THEMES = (
  [
    ['Ease of use', 34, 3, 'Positive', 'Setup takes minutes, even without an engineer'],
    ['Pricing', 22, 9, 'Mixed', 'The free tier is generous, but session replay costs extra'],
    ['Security and privacy', 14, 2, 'Positive', 'Keeps EU customer data in the EU'],
    ['Integrations', 11, 5, 'Mixed', 'Fewer warehouse connectors than Northwind'],
    ['Reputation and trust', 11, 0, 'Positive', 'Well reviewed by seed-stage founders'],
  ] as const
).map(([theme, positive, negative, tone, quote]) => ({ theme, positive, negative, tone, quote }));

export type ActionStatus = 'Open' | 'In progress' | 'Measuring' | 'Done' | 'Dismissed';
export const ACTION_STATUS_TONE: Readonly<Record<ActionStatus, BadgeTone>> = {
  Open: 'neutral',
  'In progress': 'neutral',
  Measuring: 'warning',
  Done: 'positive',
  Dismissed: 'neutral',
};

type ActionKind = 'Page' | 'Earned page' | 'Prompt' | 'Search query';

export const ACTIONS: readonly Readonly<{
  target: string;
  kind: ActionKind;
  status: ActionStatus;
  priority: Severity;
  approach: string;
}>[] = (
  [
    ['acme.com/docs/setup', 'Page', 'Open', 'High', 'Fix a technical issue'],
    ['capterra.com/analytics-software', 'Earned page', 'Open', 'High', 'Earn a placement'],
    ['acme.com/pricing', 'Page', 'In progress', 'Medium', 'Improve the existing page'],
    ['Cheapest analytics with session replay', 'Prompt', 'Open', 'Medium', 'Create a new page'],
    ['acme.com/compare/northwind', 'Page', 'Measuring', 'Medium', 'Improve the existing page'],
    ['Is Acme Analytics GDPR compliant', 'Prompt', 'Done', 'Medium', 'Improve the existing page'],
    ['mixpanel alternatives', 'Search query', 'Open', 'Low', 'Create a new page'],
    ['acme.com/blog/feature-adoption', 'Page', 'Done', 'Low', 'Improve internal links'],
    ['reddit.com/r/startups', 'Earned page', 'Dismissed', 'Low', 'Earn a placement'],
  ] as const
).map(([target, kind, status, priority, approach]) => ({
  target,
  kind,
  status,
  priority,
  approach,
}));

export const CONTENT_WORK: readonly Readonly<{
  page: string;
  planned: boolean;
  angle: string;
  prompts: number;
  sites: number;
  competitors: number;
}>[] = (
  [
    ['acme.com/blog/session-replay-guide', false, 'Session replay setup guides', 6, 5, 2],
    ['Product analytics pricing compared', true, 'Product analytics pricing compared', 5, 4, 3],
    ['acme.com/blog/funnel-analysis', false, 'Funnel analysis templates', 4, 3, 1],
    ['Mobile analytics SDK comparison', true, 'Mobile analytics SDK comparison', 3, 3, 1],
    ['acme.com/guides/retention-cohorts', false, 'Retention cohort analysis', 2, 2, 1],
  ] as const
).map(([page, planned, angle, prompts, sites, competitors]) => ({
  page,
  planned,
  angle,
  prompts,
  sites,
  competitors,
}));

export const MCP_CALLS: readonly Readonly<{ tool: string; result: string; time: string }>[] = [
  { tool: 'read_visibility_overview', result: 'Visibility 38.3%, up 4.1 pp', time: '0.4s' },
  { tool: 'read_visibility_sources', result: '212 citations to acme.com', time: '0.3s' },
  { tool: 'read_ai_crawlability', result: 'GPTBot and Google-Extended restricted', time: '0.3s' },
  { tool: 'read_actions', result: '7 open actions, 2 High', time: '0.2s' },
];

export const INTEGRATIONS: readonly Readonly<{
  name: string;
  detail: string;
  google?: boolean;
  connected: boolean;
}>[] = [
  { name: 'Google Search Console', detail: 'sc-domain:acme.com', google: true, connected: true },
  { name: 'Google Analytics 4', detail: 'Acme Analytics – web', google: true, connected: true },
  { name: 'Cloudflare Logpush', detail: 'AI crawler requests', connected: true },
  { name: 'Bing Webmaster Tools', detail: 'Bing clicks and impressions', connected: false },
];

export const SHELF: readonly Readonly<{
  product: string;
  brand: string;
  domain: string;
  answers: number;
  best: number;
  own?: boolean;
}>[] = [
  { product: 'Northwind Growth', brand: 'Northwind', domain: 'northwind.io', answers: 24, best: 1 },
  {
    product: 'Acme Startup',
    brand: 'Acme Analytics',
    domain: 'acme.com',
    answers: 20,
    best: 1,
    own: true,
  },
  { product: 'Lumen Pro', brand: 'Lumen', domain: 'lumen.app', answers: 15, best: 2 },
  {
    product: 'Fathom Labs Team',
    brand: 'Fathom Labs',
    domain: 'fathomlabs.com',
    answers: 9,
    best: 3,
  },
];
