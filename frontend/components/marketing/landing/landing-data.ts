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

export const CAPABILITIES = [
  {
    number: '01',
    label: 'BRAND PRESENCE',
    title: 'AI visibility',
    body: 'Brand mentions, positions and competitor presence across tracked prompts.',
    action: 'Visibility analysis',
    tab: 'visibility',
    tone: 'blue',
  },
  {
    number: '02',
    label: 'CITATION CONTEXT',
    title: 'Source intelligence',
    body: 'Cited domains, URLs and source patterns behind recorded AI answers.',
    action: 'Source analysis',
    tab: 'sources',
    tone: 'sand',
  },
  {
    number: '03',
    label: 'WEBSITE READINESS',
    title: 'Site Health',
    body: 'Technical and AEO findings supported by page-level crawl evidence.',
    action: 'Website analysis',
    tab: 'health',
    tone: 'rose',
  },
] as const;

export const WORKFLOW_STEPS = [
  ['01', 'Discover', 'Business context, competitor research and a relevant prompt portfolio.'],
  ['02', 'Observe', 'Brand mentions, positions and citations across configured engines.'],
  ['03', 'Diagnose', 'Source patterns, page-level findings and demand context.'],
  ['04', 'Act', 'Evidence-backed content briefs, drafts and documented changes.'],
  ['05', 'Verify', 'Comparable follow-up runs and recorded changes in performance.'],
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
    body: 'Identified gaps become structured briefs, drafts and schema, with unsupported claims flagged for review.',
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
  ['↓', 'Reports & exports', 'Documented findings for analysis and team reporting.'],
] as const;

export const FAQS = [
  [
    'What does CiteLadder measure?',
    'CiteLadder records brand mentions, positions and citations in AI answers and brings those observations together with website, search demand and content analysis. A mention, a citation and a recommendation are distinct observations.',
  ],
  [
    'How are mentions and citations different?',
    'A mention is the appearance of a brand, product or domain in an answer. A citation is a reference to a source. A brand can be mentioned without its website being cited, and a cited source is not necessarily a recommendation.',
  ],
  [
    'Are provider API keys required?',
    'Model calls use connected provider accounts. Provider usage is billed to those accounts separately from CiteLadder platform access. Available engines and run capacity depend on the connected provider configuration.',
  ],
  [
    'Does content publish automatically?',
    'No. Content Intelligence prepares briefs, drafts and schema for review. Saving content and running or scheduling audits are explicit actions.',
  ],
  [
    'How does MCP fit into the workflow?',
    'MCP provides read-only access to saved project context in compatible AI assistants, including visibility, Site Health, demand and opportunities.',
  ],
] as const;
