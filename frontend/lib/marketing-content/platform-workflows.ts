import type { PlatformPage } from './platform-pages';

/** Reviewable workflows and connections; publication remains owned by nav.ts. */
export const WORKFLOW_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/content-intelligence',
    title: 'Evidence-Backed AI Content Optimization | CiteLadder',
    description:
      'Prepare content briefs, page edits and internal-link plans from CiteLadder evidence. Review sources and revisions before your team implements changes.',
    heading: 'Create better content from the evidence behind the gap',
    lead: "Turn a website finding, buyer question or source pattern into work your team can review. CiteLadder's content workflows use the AI Agent to prepare focused deliverables while keeping relevant project evidence in view.",
    sections: [
      {
        heading: 'Begin with a clear content job',
        paragraphs: [
          'Choose whether you need a new piece, a brief, a proposed page correction or another supported output. Start with the intended audience and the evidence supporting the work, rather than asking for a generic article that merely repeats a keyword.',
        ],
      },
      {
        heading: 'Improve existing pages with a bounded proposal',
        paragraphs: [
          'Use a page finding or Action to prepare a reviewable edit or technical-fix brief. Keep the target page and the requested change explicit. Do not turn a list of affected URLs into an unsupported promise that the Agent has fixed the entire website.',
        ],
      },
      {
        heading: 'Plan internal links and earned content',
        paragraphs: [
          'Use supported skills to prepare an internal-link approach or a brief for a relevant third-party opportunity. These are proposals for human review; they do not automatically insert links, contact publishers or secure citations.',
        ],
      },
      {
        heading: 'Refine and review before implementation',
        paragraphs: [
          'Keep working on the selected deliverable and its revisions. Check factual claims, source support, audience fit and omissions. The Agent helps prepare the work; your team controls publication and external changes.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Is Content Intelligence a separate application?',
        a: "These are content-focused workflows within CiteLadder's Agent experience, connected to project evidence and Actions.",
      },
      {
        q: 'Does it publish automatically?',
        a: 'No. Drafting, saving, external implementation and later measurement are separate decisions.',
      },
      {
        q: 'Can I use these workflows in the public trial?',
        a: 'The current public trial does not include Agent access. Book a demo to explore the workflows and discuss access.',
      },
    ],
    closing: 'Turn an observed gap into something your team can use.',
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
      'Work through CiteLadder findings in a focused Agent conversation. Use saved project context and skills to create plans, edits and reviewable deliverables.',
    heading: 'An AI assistant that starts with your project evidence',
    lead: 'Ask a focused question, work through a finding and refine a useful deliverable. The CiteLadder Agent brings saved project context and supported skills into one conversation instead of making your team rebuild the context every time.',
    sections: [
      {
        heading: 'Start from a question or a specific finding',
        paragraphs: [
          'Use a supported Ask agent or Action handoff to carry the relevant context into a conversation. Explain the outcome you need: an investigation, a fix brief, a content proposal or a plan. Keep the scope small enough to review and use.',
        ],
      },
      {
        heading: 'Choose the method that fits the job',
        paragraphs: [
          'Skills provide methods for research, planning, page edits, technical fixes, internal-link plans, earned briefs, content and proposed prompt portfolios. Select the available skill that matches the outcome, rather than treating every request as the same writing task.',
        ],
      },
      {
        heading: 'Keep one deliverable understandable',
        paragraphs: [
          'A conversation owns one output kind, which can be refined across turns. Use saved context and revisions to keep the work coherent. Start a new chat when the job changes to a different kind of deliverable.',
        ],
      },
      {
        heading: 'Keep control of external actions',
        paragraphs: [
          'An explanation is not a website change. A proposed prompt portfolio is not activation. A content draft is not publication. The Agent prepares and explains work while your team decides what to approve and implement.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Does the Agent automatically fix every affected page?',
        a: 'No. It supports bounded, reviewable work. A finding across many URLs should be scoped before preparing changes.',
      },
      {
        q: 'Is this included in the free trial?',
        a: 'No. Agent access is not part of the current public trial. Book a demo to explore it.',
      },
    ],
    examples:
      '“Explain the confirmed issue on this page and prepare a developer brief.” “Use these saved findings to propose an internal-link plan.” “Prepare an outline for this buyer question and identify unsupported claims.”',
    closing: 'Bring the evidence. Leave with a clearer next step.',
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
      'Connect compatible AI assistants to authorized saved CiteLadder evidence through read-only MCP tools for visibility, website findings and search context.',
    heading: 'Bring CiteLadder evidence into your AI assistant',
    lead: 'Use a compatible MCP client to read the saved CiteLadder project data your account is authorized to access. Explore visibility, website findings and available search context without reconstructing every observation by hand.',
    sections: [
      {
        heading: 'Read project context where you already work',
        paragraphs: [
          'Connect through the documented setup and choose the authorized project. Use the available read tools to retrieve relevant saved records rather than relying on memory or a screenshot detached from its source.',
        ],
      },
      {
        heading: 'Ask questions grounded in recorded evidence',
        paragraphs: [
          "Use the current tool catalog to inspect supported visibility, Site Health, demand, opportunity and other saved projections. Tool availability follows the actual supported contract and your account's access; not every client exposes every interaction identically.",
        ],
      },
      {
        heading: 'Keep permissions and read boundaries intact',
        paragraphs: [
          'MCP does not grant access to another workspace. Reading a record does not crawl a website, purchase a dataset, activate prompts or publish content. New collection and external changes remain separate authorized actions.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Can an external assistant change my website through these tools?',
        a: 'The CiteLadder MCP connection described here is read-only. Do not treat evidence access as external publishing permission.',
      },
      {
        q: 'Does a tool read refresh the data?',
        a: "No. It returns available saved evidence. Check the record's observation time and coverage when interpreting it.",
      },
    ],
    examples:
      '“Summarize the saved visibility observations for this project.” “Show the page findings that support this Action.” “Compare the available demand evidence and explain what is missing.”',
    closing: 'Give your assistant the context behind the chart.',
    related: ['/platform/integrations', '/platform/agents', '/platform'],
  },
  {
    path: '/platform/integrations',
    title: 'Search, Analytics & AI Integrations | CiteLadder',
    description:
      'Connect Google Search Console, GA4, Bing and supported provider accounts to CiteLadder. Understand setup, access and optional research requirements.',
    heading: 'Connect the data your AI search decisions need',
    lead: 'Bring first-party search and analytics evidence into CiteLadder, configure supported model providers and add optional research when it is useful. Each connection has a defined purpose—not just a logo on a page.',
    sections: [
      {
        heading: 'First-party search and analytics',
        paragraphs: [
          '**Google Search Console:** Import supported query, page and search-performance evidence for your verified property. Use it in Performance and applicable Demand Intelligence workflows.',
          '**Google Analytics 4:** Import supported traffic and session-attribution evidence. Use AI Referral Analytics to inspect recognized AI sources, landing pages and available engagement or outcome measures.',
          '**Bing Webmaster Tools:** Connect supported Bing search data using its separate consent flow. Available reporting depends on the saved datasets and their coverage.',
        ],
      },
      {
        heading: 'Model providers and optional research',
        paragraphs: [
          '**Supported model-provider accounts:** Configure the providers required by your available audit and Agent workflows. Engine access and usage depend on your account configuration. Provider/API collection does not reproduce every consumer-app experience.',
          '**DataForSEO:** Add supported keyword, competitor and backlink research through the explicit scope-and-cost review workflow. This is optional research, not an automatic background purchase.',
        ],
      },
      {
        heading: 'Use saved evidence in external assistants',
        paragraphs: [
          '**MCP:** Read authorized persisted project context through the supported read-only tools. Consult the current setup documentation for compatible clients and connection requirements.',
        ],
      },
      {
        heading: 'Know what is connected and what is missing',
        paragraphs: [
          'A saved connection is not proof that every report has complete data. Review property mapping, imported windows, freshness and any quality notices before interpreting a missing number as zero.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Must I connect every service?',
        a: 'No. Start with the sources needed for the workflow you want to use, subject to its access and setup requirements.',
      },
      {
        q: 'Does the website advertise native Shopify sync or universal automatic log collection?',
        a: 'No. Retired or release-gated connections must not be presented as generally available integrations.',
      },
    ],
    closing: 'Choose a useful starting point for your project.',
    related: [
      '/platform/demand-intelligence',
      '/platform/search-intelligence',
      '/platform/ai-referral-analytics',
      '/platform/ai-visibility',
      '/platform/mcp',
    ],
  },
];
