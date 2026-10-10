import { AGENT_NOTE, type PlatformPage } from './platform-page-types';

/** Action and connection capabilities: content, the Agent, MCP and integrations. */
export const IMPROVE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/content-intelligence',
    title: 'Evidence-Backed AI Content Optimization | CiteLadder',
    description:
      'Prepare content briefs, page edits, comparison pages, internal-link plans and outreach briefs from your CiteLadder evidence, and review every revision before it ships.',
    heading: 'Content work that starts from the evidence.',
    lead: 'Turn a site finding, buyer question or citation pattern into a brief, a page edit or an internal-link plan. The Agent drafts it from your project evidence, and your team reviews it.',
    cta: 'demo',
    visual: 'agent',
    visualTitle: 'Agent · Output',
    note: AGENT_NOTE,
    highlights: [
      {
        title: 'Briefs and new pages',
        body: 'Outline-first drafts for the audience and evidence you choose, including comparison pages and FAQs.',
      },
      {
        title: 'Edits to existing pages',
        body: 'Focused proposals for one target page, never a promise to fix the whole site.',
      },
      {
        title: 'Links and earned media',
        body: 'Internal-link plans and outreach briefs for the third-party pages that cite your competitors.',
      },
    ],
    features: [
      {
        title: 'Start from a gap you can see.',
        body: 'Every piece of content work starts from evidence already in your project: an Action, a Site Health issue, a Search Console signal, a cited page that leaves you out, or a prompt you lose. The Agent reads that evidence first, so the draft answers the gap instead of a generic brief.',
        points: [
          'Pick up any Action or finding as the starting point',
          'Business context and competitors carried into every draft',
          'The context used is listed with each output',
        ],
        visual: 'actions',
      },
      {
        title: 'Formats for where answers come from.',
        body: 'AI answers draw on your site and on the places people discuss your category. Content workflows cover both: new pages and edits on your site, plus drafts for the channels engines cite.',
        points: [
          'Briefs, new pages, comparison pages and FAQ pages',
          'Page edits and internal-link plans',
          'LinkedIn and X posts, video scripts and forum answers',
          'Outreach briefs for earned sources',
        ],
        visual: 'skills',
      },
      {
        title: 'Revise until it is right.',
        body: 'Every deliverable keeps its revisions. Long pieces start from an outline you approve. Edit sections yourself, ask for a change to one part, and compare any version with the latest.',
        points: [
          'Outline first for long-form content',
          'Section-level edits and follow-ups',
          'Full revision history',
        ],
        visual: 'revisions',
      },
    ],
    steps: [
      {
        title: 'Pick a starting point',
        body: 'Choose an Action, finding or question, or start a new chat with a content skill.',
      },
      {
        title: 'Approve the outline',
        body: 'The Agent proposes the structure and evidence; you adjust it before drafting.',
      },
      {
        title: 'Review the draft',
        body: 'Edit sections, ask for changes and compare revisions.',
      },
      {
        title: 'Ship and measure',
        body: 'Publish through your own process, mark the work implemented, and watch later evidence.',
      },
    ],
    questions: [
      'What should our comparison page against a named competitor say?',
      'Which page should we update to answer a prompt we keep losing?',
      'Which internal links would help a page that answers engines skip?',
      'What should we pitch to a publisher that lists our competitors?',
    ],
    faqs: [
      {
        q: 'Is this a separate application?',
        a: "No. Content workflows run in CiteLadder's Agent, connected to your project evidence and Actions.",
      },
      {
        q: 'What can it produce?',
        a: 'Content briefs, new pages, comparison pages, FAQ pages, edits to existing pages, internal-link plans, outreach briefs, social posts, video scripts and forum answers.',
      },
      {
        q: 'Does it publish automatically?',
        a: 'No. Drafting, saving, publishing and measuring are separate decisions your team makes.',
      },
      {
        q: 'Will it invent facts about my company?',
        a: 'The Agent works from your confirmed business context and saved evidence, and it is instructed not to invent company, product, customer, price or statistic facts. Your team reviews every draft before it is used.',
      },
      {
        q: 'Is it in the free trial?',
        a: 'No. Content workflows run in the Agent, which is not part of the free trial. Book a demo to try it with your own project.',
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
      'An AI assistant that reads your saved CiteLadder evidence and produces briefs, edits and plans you review. It never publishes on its own.',
    heading: 'An assistant that starts from your evidence.',
    lead: 'Ask a question or pick up an Action. The Agent reads your saved project evidence, explains what it found, and drafts the brief, edit or plan you asked for.',
    cta: 'demo',
    visual: 'agent',
    visualTitle: 'Agent',
    note: AGENT_NOTE,
    highlights: [
      {
        title: 'Grounded answers',
        body: 'It reads the visibility, site, demand and traffic records in your project before it answers.',
      },
      {
        title: 'Skills for the job',
        body: 'Diagnosis, content, technical fixes, internal links, earned media, growth plans and prompt portfolios.',
      },
      {
        title: 'You stay in control',
        body: 'It reads; it never publishes, contacts anyone or changes your site.',
      },
    ],
    features: [
      {
        title: 'Hand off from any finding.',
        body: 'Ask the Agent from Site Health, Demand or Search Intelligence and the evidence comes with it. Mention open Actions to bring their diagnoses into the conversation. Each step it reads is shown as it works.',
        points: [
          'Typed handoffs, no copy and paste',
          'One deliverable per conversation',
          'Step-by-step reads shown as it works',
        ],
        visual: 'skills',
      },
      {
        title: 'Skills that know the job.',
        body: 'Each skill guides the Agent through a specific piece of work with the right evidence and output format, so you get a usable deliverable rather than a chat transcript.',
        points: [
          'AI visibility diagnosis and growth plans',
          'Technical health and internal links',
          'Content, comparison pages and programmatic page pilots',
          'Search Console optimization, search opportunities and earned authority',
          'Prompt discovery and measuring results',
        ],
        visual: 'actions',
      },
      {
        title: 'Bounded by design.',
        body: 'The Agent uses the same read tools as the CiteLadder MCP server, inside limits set for each run. It cannot crawl, buy data, change prompts, publish, browse the open web or contact anyone, and it never declares that a change worked without new evidence.',
        points: [
          'Reads only the project you are in',
          'Step and size limits on every run',
          'Outputs are reviewable drafts with revisions',
        ],
        visual: 'revisions',
      },
    ],
    steps: [
      {
        title: 'Open the Agent',
        body: 'Switch from Dashboard to Agent, or ask from any finding.',
      },
      {
        title: 'Choose a skill',
        body: 'Pick the job, or describe it and let the Agent suggest one.',
      },
      {
        title: 'Watch it read',
        body: 'The Agent reads the evidence it needs and explains what it found.',
      },
      {
        title: 'Review the output',
        body: 'Revise the deliverable, then take it into your own workflow.',
      },
    ],
    questions: [
      'Why does a competitor win comparisons we lose?',
      'What should we fix first across our open Actions?',
      'Which prompts are missing from our portfolio?',
      'What is a realistic growth plan for next quarter?',
      'Did the changes we shipped last month move anything?',
    ],
    faqs: [
      {
        q: 'Does the Agent fix every affected page automatically?',
        a: 'No. It prepares bounded, reviewable work for a specific target. Your team decides what to implement.',
      },
      {
        q: 'What can the Agent see?',
        a: 'The saved evidence in the project you are working in: visibility results, sources, Site Health, Search Console, GA4, AI traffic, saved research and Actions. It does not browse the open web.',
      },
      {
        q: 'Which model does it use?',
        a: 'CiteLadder runs the Agent on a hosted model by default. Teams that need their own provider can connect an OpenAI-compatible API.',
      },
      {
        q: 'Can it take actions on my behalf?',
        a: 'No. It has no write tools. It cannot publish, send messages, activate prompts, start crawls, buy data or change your site.',
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
    title: 'AI Visibility MCP Server for Claude, ChatGPT & More | CiteLadder',
    description:
      'Connect Claude, ChatGPT, Gemini, Grok, Cursor and other MCP clients to your CiteLadder visibility, site and search evidence through a read-only connection.',
    heading: 'Your CiteLadder evidence, in your AI assistant.',
    lead: 'Ask Claude, ChatGPT and other assistants about your AI visibility, cited sources, Site Health and search performance. They answer from your saved CiteLadder records, for the workspaces you approve.',
    cta: 'mcp',
    visual: 'mcp',
    visualTitle: 'MCP client',
    highlights: [
      {
        title: '1. Connect',
        body: 'Use Connect, or add https://citeladder.com/mcp as a custom connector in your assistant.',
      },
      {
        title: '2. Sign in and approve',
        body: 'Sign in to CiteLadder and choose which workspaces the assistant may read. No API key to copy.',
      },
      {
        title: '3. Ask a question',
        body: 'Try “Which competitors appear most in our latest AI visibility results?”',
      },
    ],
    features: [
      {
        title: 'Ask questions grounded in recorded evidence.',
        body: 'Read visibility results and trends, perception, ads, cited sources, Actions, Site Health, performance, AI referrals, AI crawler logs, the AI Shelf, demand and saved Search Intelligence datasets. Every answer comes from a dated record, not a guess.',
        points: [
          'Read-only: no crawls, purchases, prompt changes or publishing',
          'Unavailable data is reported as unavailable, never as zero',
          'Links back to the screen in CiteLadder that shows the record',
        ],
        visual: 'mcp-tools',
      },
      {
        title: 'Turn evidence into the work your team already does.',
        body: 'Use the assistant your team already works in to prepare briefs, reports and fix lists from the same evidence as the app.',
        points: [
          'Weekly AI visibility brief across engines and competitors',
          'Site fix brief from the latest Site Health crawl',
          'Cited-source review before outreach or content work',
        ],
        visual: 'visibility',
      },
    ],
    steps: [
      {
        title: 'Add the connector',
        body: 'Click Connect for your assistant, or paste https://citeladder.com/mcp as a custom connector.',
      },
      {
        title: 'Sign in',
        body: 'Sign in to CiteLadder in your browser. There is no API key to create or paste.',
      },
      {
        title: 'Approve workspaces',
        body: 'Choose which workspaces the assistant may read.',
      },
      {
        title: 'Ask',
        body: 'Ask in plain language. The assistant lists your projects and reads the records it needs.',
      },
    ],
    questions: [
      'Which competitors appear most in our latest AI visibility results?',
      'Summarize what changed in our AI visibility this week.',
      'Which Site Health issues affect our most-cited pages?',
      'Which sources do AI answers cite for our top prompts?',
      'How much traffic did AI assistants send us last month?',
    ],
    faqs: [
      {
        q: 'What is the CiteLadder MCP server?',
        a: 'A hosted Model Context Protocol server at https://citeladder.com/mcp. It lets a compatible AI assistant read your CiteLadder project evidence so you can ask questions about it in plain language.',
      },
      {
        q: 'Which assistants does it work with?',
        a: 'Claude, ChatGPT, Gemini, Grok, Cursor, Claude Code and Codex, plus any client that supports remote MCP servers with browser sign-in. Some assistants limit custom connectors by plan or region.',
      },
      {
        q: 'What do I need to connect?',
        a: 'A CiteLadder workspace with an active trial or subscription, and a project for the assistant to read. If you are new, the sign-in step lets you create an account and set up a project first.',
      },
      {
        q: 'Can an assistant change my website or my data through MCP?',
        a: 'No. The connection is read-only. It cannot crawl, buy data, activate prompts, publish or change anything in CiteLadder or on your site.',
      },
      {
        q: 'Does reading a tool refresh the data?',
        a: 'No. It returns saved evidence with its observation date. Refresh data in CiteLadder, then ask again.',
      },
      {
        q: 'What can the assistant see?',
        a: 'Only the workspaces you approve, and only while you remain a member. Data an assistant has already read is held under that assistant’s own terms.',
      },
      {
        q: 'How do I disconnect?',
        a: 'Open Settings → MCP connections in CiteLadder and remove the connection. Workspace Owners and Admins can also remove any connection to their workspace.',
      },
      {
        q: 'Is there a REST API too?',
        a: 'Yes: on paid plans the same data and scoped actions are available through a REST API at https://api.citeladder.com/v1, with keys from Settings → API keys.',
      },
    ],
    closing: 'Give your assistant the context behind the chart.',
    related: ['/platform/integrations', '/platform/agents', '/platform'],
  },
  {
    path: '/platform/integrations',
    title: 'Search, Analytics, Log & AI Integrations | CiteLadder',
    description:
      'Connect Google Search Console, GA4, Bing Webmaster Tools, Cloudflare, Amazon CloudFront and Google Cloud logs, model providers, DataForSEO and MCP clients to CiteLadder.',
    heading: 'Connect your search, analytics and research data.',
    lead: 'Bring in first-party search, analytics and server-log data, configure model providers, and add research when it helps. Each connection does a specific job, and you can start without any of them.',
    cta: 'setup',
    visual: 'integrations',
    visualTitle: 'Integrations',
    highlights: [
      {
        title: 'Search and analytics',
        body: 'Google Search Console, GA4 and Bing Webmaster Tools, each with its own consent.',
      },
      {
        title: 'Server logs',
        body: 'Cloudflare Worker, Cloudflare Logpush, Amazon CloudFront, Google Cloud, a webhook or a file upload for AI crawler logs.',
      },
      {
        title: 'Models, research and assistants',
        body: 'Model providers for the Agent, DataForSEO for optional research, and read-only MCP access.',
      },
    ],
    features: [
      {
        title: 'Know what is connected and what is missing.',
        body: 'Property mapping, imported windows, freshness and quality notes sit with every connection, so a missing number is never read as zero.',
        points: [
          'Search Console queries and pages',
          'GA4 sessions, AI referrals and key events',
          'Bing search data through its own consent',
        ],
        visual: 'property-mapping',
      },
      {
        title: 'Send AI crawler logs your way.',
        body: 'On paid plans, connect the edge you already run. Use a Cloudflare Worker or Logpush job, stream Amazon CloudFront logs, route Google Cloud load balancer and Cloud Run logs through Pub/Sub, post batches to a webhook, or upload a file. CiteLadder shows log coverage per day, so gaps are visible.',
        points: [
          'Cloudflare Worker and Cloudflare Logpush',
          'Amazon CloudFront log streams',
          'Google Cloud load balancer and Cloud Run logs through Pub/Sub',
          'Webhook and file upload for any other server',
          'IP addresses used for verification only, never stored',
        ],
        visual: 'crawlers',
      },
    ],
    steps: [
      {
        title: 'Start with visibility',
        body: 'AI visibility and Site Health work without any integration.',
      },
      {
        title: 'Add first-party data',
        body: 'Connect Search Console, GA4 or Bing when you want demand and referral evidence.',
      },
      {
        title: 'Add logs and research',
        body: 'Send crawler logs or connect DataForSEO when your questions need them.',
      },
      {
        title: 'Connect assistants',
        body: 'Give Claude, ChatGPT and other MCP clients read-only access.',
      },
    ],
    questions: [
      'Which Search Console property and GA4 stream feed this project?',
      'How fresh is the data behind this report?',
      'Are our server logs complete for the last month?',
      'Which assistants can read our workspace?',
    ],
    faqs: [
      {
        q: 'Do I need to connect everything?',
        a: 'No. Start with what your workflow needs and add the rest later. AI visibility and Site Health need no integration.',
      },
      {
        q: 'Which integrations are available?',
        a: 'Google Search Console, GA4, Bing Webmaster Tools, AI crawler log sources (Cloudflare Worker, Cloudflare Logpush, Amazon CloudFront, Google Cloud, webhook and upload), DataForSEO, model providers and MCP clients.',
      },
      {
        q: 'Is there a native Shopify sync?',
        a: 'No. Commerce catalogs come from your site or a CSV import.',
      },
      {
        q: 'Which servers can send crawler logs?',
        a: 'Cloudflare, Amazon CloudFront and Google Cloud load balancers and Cloud Run connect directly. Any other server or CDN can post logs to a webhook or upload a file.',
      },
      {
        q: 'Can I use my own model provider?',
        a: 'Yes. The Agent can run on your own OpenAI-compatible API instead of the hosted model.',
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
