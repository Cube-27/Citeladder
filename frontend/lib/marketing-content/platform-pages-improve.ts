import { AGENT_NOTE, type PlatformPage } from './platform-page-types';

/** Diagnosis, action and connection capabilities. */
export const IMPROVE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/site-health',
    title: 'AEO Website Audit & Technical SEO Checks | CiteLadder',
    description:
      'Crawl your site for technical SEO, answer-readiness and AI crawler access issues, with page-level evidence for every finding.',
    heading: 'Find the site issues that keep you out of answers.',
    lead: 'Crawl your site and get page-level findings with the evidence attached — from indexing and structured data to which AI crawlers your robots.txt lets in.',
    cta: 'demo',
    visual: 'site-health',
    visualTitle: 'Site Health',
    highlights: [
      {
        title: 'Page-level evidence',
        body: 'Each finding shows the page, what was captured and why it matters for that type of page.',
      },
      {
        title: 'AI crawler access',
        body: 'robots.txt permissions by crawler purpose: AI search, training and user-triggered fetches.',
      },
      {
        title: 'Honest coverage',
        body: 'Scores come with what was checked, so a partial crawl never reads as a full audit.',
      },
    ],
    features: [
      {
        title: 'Technical and answer-readiness checks together.',
        body: 'Review website fundamentals alongside the structure, evidence and machine readability that answer engines rely on. Unresolved checks stay visible instead of passing silently.',
        points: [
          'Grouped issues with affected pages',
          'Page classification behind each check',
          'Scores paired with crawl coverage',
        ],
        visual: 'page-evidence',
      },
      {
        title: 'From a finding to a fix brief.',
        body: 'Hand any issue to the Agent to prepare a bounded developer brief. Your team implements it, and a later crawl checks the result.',
        points: [
          'Ask the Agent from any issue group',
          'Briefs cite the captured evidence',
          'Re-crawl to verify the change',
        ],
        visual: 'agent',
      },
    ],
    faqs: [
      {
        q: 'Does a higher score guarantee AI citations?',
        a: 'No. It summarizes the checks that applied to your pages. Engines decide what to index and cite on their own.',
      },
      {
        q: 'Is robots permission the same as crawler traffic?',
        a: 'No. Site Health reads your policy. Allowing a crawler is not evidence that it visited.',
      },
    ],
    closing: 'Give your developers a clear starting point.',
    related: [
      '/platform/content-intelligence',
      '/platform/demand-intelligence',
      '/platform/agents',
      '/platform/ai-visibility',
    ],
  },
  {
    path: '/platform/demand-intelligence',
    title: 'Search Demand & GSC Opportunity Analysis | CiteLadder',
    description:
      'Turn Search Console queries and landing pages into ranked opportunities: striking-distance queries, CTR gaps, competing pages and demand shifts.',
    heading: 'Find the opportunities already in your search data.',
    lead: 'Connect Search Console to see which queries reach which pages, and surface the signals worth acting on — instead of another unranked keyword list.',
    cta: 'demo',
    visual: 'demand',
    visualTitle: 'Search Demand',
    highlights: [
      {
        title: 'Striking distance',
        body: 'Queries ranking just off page one, tied to the page that ranks for them.',
      },
      {
        title: 'CTR gaps',
        body: 'Pages earning fewer clicks than your property’s norm for their position.',
      },
      {
        title: 'Demand shifts',
        body: 'Coverage-checked changes between periods, with branded demand kept separate.',
      },
    ],
    features: [
      {
        title: 'Queries in their landing-page context.',
        body: 'See what each page actually appears for before deciding how it should change. Where the page can be read, its title, H1 and content are compared with the queries it wins.',
        points: [
          'Grouped by page or by query',
          'Reporting window and source on every row',
          'Unknown and ambiguous states kept visible',
        ],
        visual: 'query-page',
      },
      {
        title: 'From a signal to a reviewable edit.',
        body: 'Open the evidence behind any page Action and hand it to the Agent to draft a focused change. Later data shows what happened next.',
        points: [
          'Signals promote into page Actions',
          'Evidence travels with the handoff',
          'Changes measured against the earlier window',
        ],
        visual: 'actions',
      },
    ],
    faqs: [
      {
        q: 'Is this data from private AI conversations?',
        a: 'No. Demand Intelligence uses your connected Search Console data. Suggested prompts are suggestions, not AI search volumes.',
      },
      {
        q: 'How is this different from Search Intelligence?',
        a: 'Demand uses your own first-party data. Search Intelligence adds external keyword, competitor and backlink research when you need it.',
      },
    ],
    closing: 'Use the search data you already have to choose better work.',
    related: [
      '/platform/search-intelligence',
      '/platform/site-health',
      '/platform/content-intelligence',
      '/platform/integrations',
    ],
  },
  {
    path: '/platform/search-intelligence',
    title: 'Keyword, Competitor & Backlink Research | CiteLadder',
    description:
      'Research keywords, competing domains, top pages and backlinks with optional DataForSEO datasets, priced and confirmed before collection.',
    heading: 'Keyword and backlink research beside your AI evidence.',
    lead: 'Add external research when your own data cannot answer the question: ranked keywords, competitors, top pages and backlinks — each collection reviewed and priced before you confirm.',
    cta: 'setup',
    visual: 'search',
    visualTitle: 'Search Intelligence',
    highlights: [
      {
        title: 'Keywords and competitors',
        body: 'Ranked keywords, shared keywords and top pages for your domain and the rivals you choose.',
      },
      {
        title: 'Backlinks and overlap',
        body: 'Referring domains and link detail, matched to cited sources where the data allows.',
      },
      {
        title: 'No surprise spend',
        body: 'Every new collection shows its scope and maximum cost, and runs only after you confirm.',
      },
    ],
    features: [
      {
        title: 'Review the scope and cost first.',
        body: 'New DataForSEO research uses a review-and-confirm step. Opening a saved dataset never buys a refresh, and missing results are never rewritten as zero.',
        points: [
          'Target, market and row limit up front',
          'Maximum cost before you confirm',
          'Saved datasets reopen for free',
        ],
        visual: 'acquisition',
      },
    ],
    faqs: [
      {
        q: 'Is Search Intelligence in the free trial?',
        a: 'No. It needs the right plan, a provider connection and a confirmation for each collection. Contact us to discuss your use case.',
      },
      {
        q: 'Are search volumes the number of people asking AI?',
        a: 'No. They are external search estimates with their own definitions, not a count of AI conversations.',
      },
    ],
    closing: 'Research the questions your own data cannot answer.',
    related: [
      '/platform/demand-intelligence',
      '/platform/citation-intelligence',
      '/platform/content-intelligence',
      '/platform/integrations',
    ],
  },
  {
    path: '/platform/content-intelligence',
    title: 'Evidence-Backed AI Content Optimization | CiteLadder',
    description:
      'Prepare content briefs, page edits and internal-link plans from your CiteLadder evidence, and review every revision before it ships.',
    heading: 'Content work that starts from the evidence.',
    lead: 'Turn a site finding, buyer question or citation pattern into a brief, a page edit or an internal-link plan — drafted by the Agent with your project evidence in view, and reviewed by your team.',
    cta: 'demo',
    visual: 'agent',
    visualTitle: 'Agent · Output',
    note: AGENT_NOTE,
    highlights: [
      {
        title: 'Briefs and new pages',
        body: 'Outline-first drafts for the audience and evidence you choose.',
      },
      {
        title: 'Edits to existing pages',
        body: 'Focused proposals for one target page, never a promise to fix the whole site.',
      },
      {
        title: 'Internal links',
        body: 'Link plans and earned-content briefs for human review.',
      },
    ],
    features: [
      {
        title: 'Revise until it is right.',
        body: 'Every deliverable keeps its revisions. Edit sections yourself, ask for a change to one part, and compare any version with the latest.',
        points: [
          'Section-level edits and follow-ups',
          'Full revision history',
          'Sources linked from every claim',
        ],
        visual: 'revisions',
      },
    ],
    faqs: [
      {
        q: 'Is this a separate application?',
        a: 'No. Content workflows run in CiteLadder’s Agent, connected to your project evidence and Actions.',
      },
      {
        q: 'Does it publish automatically?',
        a: 'No. Drafting, saving, publishing and measuring are separate decisions your team makes.',
      },
    ],
    closing: 'Turn an observed gap into content your team can ship.',
    related: [
      '/platform/agents',
      '/platform/site-health',
      '/platform/demand-intelligence',
      '/platform/search-intelligence',
      '/platform/citation-intelligence',
    ],
  },
  {
    path: '/platform/agents',
    title: 'AI SEO Assistant Grounded in Your Evidence | CiteLadder',
    description:
      'An AI assistant that reads your saved CiteLadder evidence and produces briefs, edits and plans you review — it never publishes on its own.',
    heading: 'An assistant that starts from your evidence.',
    lead: 'Ask a question or pick up an Action. The Agent reads your saved project evidence, explains what it found, and drafts the brief, edit or plan you asked for.',
    cta: 'demo',
    visual: 'agent',
    visualTitle: 'Agent',
    note: AGENT_NOTE,
    highlights: [
      {
        title: 'Grounded answers',
        body: 'Every claim links to the visibility, site or demand record it came from.',
      },
      {
        title: 'Skills for the job',
        body: 'Research, page edits, technical fixes, internal links, content and prompt portfolios.',
      },
      {
        title: 'You stay in control',
        body: 'It reads; it never publishes, contacts anyone or changes your site.',
      },
    ],
    features: [
      {
        title: 'Hand off from any finding.',
        body: 'Ask agent from Site Health, Demand or Search Intelligence and the evidence travels with you. Mention open Actions to bring their diagnoses into the conversation.',
        points: [
          'Typed handoffs, no copy and paste',
          'One deliverable per conversation',
          'Step-by-step reads shown as it works',
        ],
        visual: 'skills',
      },
    ],
    faqs: [
      {
        q: 'Does the Agent fix every affected page automatically?',
        a: 'No. It prepares bounded, reviewable work for a specific target. Your team decides what to implement.',
      },
      {
        q: 'Is the Agent in the free trial?',
        a: 'No. Book a demo to try it with your own project.',
      },
    ],
    closing: 'Bring your evidence. Leave with a clear next step.',
    related: [
      '/platform/content-intelligence',
      '/platform/site-health',
      '/platform/mcp',
      '/platform',
    ],
  },
  {
    path: '/platform/mcp',
    title: 'AI Visibility MCP Server & Assistant Access | CiteLadder',
    description:
      'Read your CiteLadder visibility, site and search evidence from compatible AI assistants through read-only MCP tools.',
    heading: 'Your CiteLadder evidence, in your AI assistant.',
    lead: 'Connect a compatible MCP client to read the projects you are authorized to see — visibility, site findings, demand and opportunities — without copying screenshots around.',
    cta: 'mcp',
    visual: 'mcp',
    visualTitle: 'MCP client',
    highlights: [
      {
        title: 'Read-only by design',
        body: 'Tools read saved evidence. They never crawl, buy data, activate prompts or publish.',
      },
      {
        title: 'Your permissions',
        body: 'Access follows your workspace membership and stops when it does.',
      },
      {
        title: 'Saved, dated records',
        body: 'Every read returns persisted evidence with its observation time and coverage.',
      },
    ],
    features: [
      {
        title: 'Ask questions grounded in recorded evidence.',
        body: 'Use the documented tool catalogue to read visibility trends and results, Site Health, demand, opportunities and more. Available tools follow the current contract and your access.',
        points: [
          'OAuth sign-in from compatible clients',
          'Project-scoped, authorized reads',
          'No refresh or purchase on read',
        ],
        visual: 'mcp-tools',
      },
    ],
    faqs: [
      {
        q: 'Can an assistant change my website through MCP?',
        a: 'No. The CiteLadder MCP connection is read-only.',
      },
      {
        q: 'Does reading a tool refresh the data?',
        a: 'No. It returns saved evidence. Check the observation time when you interpret it.',
      },
    ],
    closing: 'Give your assistant the context behind the chart.',
    related: ['/platform/integrations', '/platform/agents', '/platform'],
  },
  {
    path: '/platform/integrations',
    title: 'Search, Analytics & AI Integrations | CiteLadder',
    description:
      'Connect Google Search Console, GA4, Bing Webmaster Tools, model providers, DataForSEO and MCP clients to CiteLadder.',
    heading: 'Connect the data behind better decisions.',
    lead: 'Bring in first-party search and analytics data, configure model providers, and add research when it helps. Each connection has a clear purpose — and none is required to start.',
    cta: 'setup',
    visual: 'integrations',
    visualTitle: 'Integrations',
    highlights: [
      {
        title: 'Search and analytics',
        body: 'Google Search Console, GA4 and Bing Webmaster Tools, each with its own consent.',
      },
      {
        title: 'Models and research',
        body: 'Model provider accounts for audits and the Agent; DataForSEO for optional research.',
      },
      {
        title: 'Assistants',
        body: 'Read-only MCP access from compatible clients.',
      },
    ],
    features: [
      {
        title: 'Know what is connected — and what is missing.',
        body: 'Property mapping, imported windows, freshness and quality notes sit with every connection, so a missing number is never read as zero.',
        points: [
          'Search Console queries and pages',
          'GA4 sessions, AI referrals and key events',
          'Bing search data through its own consent',
        ],
        visual: 'property-mapping',
      },
    ],
    faqs: [
      {
        q: 'Do I need to connect everything?',
        a: 'No. Start with what your workflow needs and add the rest later.',
      },
      {
        q: 'Is there a native Shopify sync or automatic log collection?',
        a: 'No. Neither is offered as a generally available integration.',
      },
    ],
    closing: 'Pick a starting point for your project.',
    related: [
      '/platform/demand-intelligence',
      '/platform/search-intelligence',
      '/platform/ai-referral-analytics',
      '/platform/ai-visibility',
      '/platform/mcp',
    ],
  },
];
