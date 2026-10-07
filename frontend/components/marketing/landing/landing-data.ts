/** Public page copy and fictional preview records for the landing page. */
export const SOURCE_ROWS = [
  {
    domain: 'zernovelle.example',
    url: 'zernovelle.example/platform',
    type: 'Owned',
    citations: 38,
    prompts: 18,
  },
  {
    domain: 'reviewdesk.example',
    url: 'reviewdesk.example/best-workflow-tools',
    type: 'Review',
    citations: 31,
    prompts: 15,
  },
  {
    domain: 'fieldnotes.example',
    url: 'fieldnotes.example/automation-guide',
    type: 'Editorial',
    citations: 26,
    prompts: 13,
  },
  {
    domain: 'discuss.example',
    url: 'discuss.example/workflow-discussion',
    type: 'Community',
    citations: 19,
    prompts: 11,
  },
  {
    domain: 'brelovanta.example',
    url: 'brelovanta.example/compare',
    type: 'Competitor',
    citations: 16,
    prompts: 9,
  },
] as const;

/** Fictional values for the public dashboard preview. */
export const HERO_COMPETITORS = [
  { name: 'Zernovelle', visibility: 64.4, position: 2.4, history: [52, 54, 55, 59, 58, 62, 64.4] },
  { name: 'Brelovanta', visibility: 58.2, position: 3.1, history: [61, 61, 60, 60, 59, 59, 58.2] },
  { name: 'Flevorynth', visibility: 41.8, position: 4.2, history: [36, 38, 39, 40, 42, 41, 41.8] },
] as const;

export const HERO_SOURCE_MIX = [
  { name: 'Owned', percent: 30 },
  { name: 'Review', percent: 25 },
  { name: 'Editorial', percent: 23 },
  { name: 'Community', percent: 14 },
  { name: 'Competitor', percent: 8 },
] as const;

export const WORKFLOW_STEPS = [
  [
    '01',
    'Measure the questions that matter.',
    'Build a buyer-question portfolio and inspect the answers collected for your project.',
  ],
  [
    '02',
    'Investigate the evidence.',
    'Follow a visibility change into cited sources, page findings, relevant search data or referral activity.',
  ],
  [
    '03',
    'Prepare the next action.',
    'Use an appropriate Agent workflow to develop a brief, proposed edit or plan. Your team reviews and implements the change.',
  ],
  [
    '04',
    'Measure again.',
    'Compare later observations with the earlier baseline and check whether the collection conditions remain comparable.',
  ],
] as const;

export const MODULES = [
  {
    id: 'visibility',
    label: 'AI Visibility',
    eyebrow: 'BRAND PERFORMANCE',
    title: 'Brand presence across AI answers.',
    body: 'Visibility trends, competitor comparisons and prompt-level answers in a single reporting view.',
    points: [
      'Mentions and average position',
      'Comparable prompt portfolios',
      'Engine-level answer history',
    ],
  },
  {
    id: 'sources',
    label: 'Sources',
    eyebrow: 'CITATION INTELLIGENCE',
    title: 'The sources behind AI answers.',
    body: 'Cited domains and URLs, classified by source type, with usage across the tracked prompt portfolio.',
    points: [
      'Domain and URL analysis',
      'Owned, earned and competitor sources',
      'Observed query fanouts',
    ],
  },
  {
    id: 'health',
    label: 'Site Health',
    eyebrow: 'WEBSITE INTELLIGENCE',
    title: 'Page readiness with a clear record.',
    body: 'Technical and AEO findings are tied to the pages and crawl evidence behind them.',
    points: ['Crawl and indexability checks', 'Page-level findings', 'Prioritized fixes'],
  },
  {
    id: 'demand',
    label: 'Demand Intelligence',
    eyebrow: 'SEARCH DEMAND',
    title: 'Search behavior beside AI visibility.',
    body: 'Connected search and traffic observations add first-party context to the questions buyers ask.',
    points: ['Search Console queries', 'Landing-page performance', 'Analytics context'],
  },
  {
    id: 'content',
    label: 'Content Intelligence',
    eyebrow: 'CONTENT DEVELOPMENT',
    title: 'Content grounded in source evidence.',
    body: 'Use Agent workflows to prepare briefs and proposed edits for human review. Agent access is not included in the current public trial.',
    points: [
      'Evidence-backed briefs and drafts',
      'Source references retained',
      'Explicit content-saving controls',
    ],
  },
  {
    id: 'mcp',
    label: 'MCP',
    eyebrow: 'CONNECTED WORKFLOWS',
    title: 'Product context beyond the dashboard.',
    body: 'Authorized project context is available to compatible assistants through a read-only MCP connection.',
    points: [
      'Business context and AI visibility',
      'Site findings and evidence',
      'Permission-aware tool access',
    ],
  },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];

export const INTEGRATIONS = [
  ['GSC', 'Google Search Console', 'Search queries, landing pages and organic performance.'],
  ['GA4', 'Google Analytics', 'Traffic and behavioral context alongside search visibility.'],
  ['AI', 'Google AI Overviews', 'Observed answer and source context from Google Search.'],
  ['KEY', 'Model providers', 'Configured OpenAI, Google and Anthropic accounts.'],
  ['MCP', 'MCP', 'Read-only project context in compatible AI assistants.'],
  ['BING', 'Bing Webmaster Tools', 'Search evidence through separate consent and saved datasets.'],
] as const;

export const TEAMS = [
  [
    'Brand & growth',
    'Brand presence, competitor comparisons and citation patterns across relevant buyer questions.',
    'Brand performance',
    'visibility',
  ],
  [
    'Search & web',
    'Technical findings, page readiness and search demand for prioritizing website improvements.',
    'Website intelligence',
    'health',
  ],
  [
    'Content & editorial',
    'Source-backed briefs, drafts and structured data informed by observed content gaps.',
    'Content development',
    'content',
  ],
] as const;

export const FAQS = [
  [
    'Is CiteLadder only an AI visibility tracker?',
    'No. It combines AI answer and citation observations with website diagnostics, connected search and analytics data, and reviewable Agent workflows. Availability depends on the capability and account setup.',
  ],
  [
    'Does the free trial include the whole platform?',
    'No. The current trial provides limited AI visibility access for seven days. Contact us to explore advanced workflows or continue after the trial.',
  ],
  [
    'Does CiteLadder publish changes automatically?',
    'No. The Agent helps prepare work for review. Your team controls external implementation and later measurement.',
  ],
] as const;
