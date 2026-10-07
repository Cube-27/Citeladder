/** Reviewed product copy. Published paths and labels belong to nav.ts. */
export type PlatformPage = {
  path: string;
  title: string;
  description: string;
  heading: string;
  lead: string;
  sections: readonly { heading: string; paragraphs: readonly string[] }[];
  faqs: readonly { q: string; a: string }[];
  workflow?: string;
  examples?: string;
  closing: string;
  related: readonly string[];
};

export const TRIAL_NOTE =
  'Start with a 7-day AI visibility trial. Trial limits apply. Contact us to continue after the trial or explore advanced workflows.';

export const PLATFORM_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform',
    title: 'AI Search Intelligence Platform | CiteLadder',
    description:
      "Explore CiteLadder's AI visibility, citation analysis, website diagnostics, search intelligence, referral analytics and reviewable content workflows.",
    heading: 'One platform for AI visibility, website evidence and action',
    lead: "Understand where your brand appears, investigate the sources and pages behind the result, and prepare the work that deserves your team's attention. CiteLadder brings these capabilities into a connected project.",
    sections: [
      {
        heading: 'Measure how your brand and products appear',
        paragraphs: [
          'Track a defined set of buyer questions, review brand and competitor observations, and inspect cited domains and URLs. For eligible commerce projects, study product and category appearances through AI Shelf. Use AI Referral Analytics to examine identifiable visits separately from answer visibility.',
        ],
      },
      {
        heading: 'Diagnose what needs attention',
        paragraphs: [
          'Site Health gives findings a page-level context. Demand Intelligence identifies useful patterns in your first-party search evidence. Search Intelligence adds optional keyword, competitor and backlink research. Each source contributes a different perspective rather than a replacement for the others.',
        ],
      },
      {
        heading: 'Prepare improvements with the evidence in view',
        paragraphs: [
          'Use the AI Agent to work through a focused question or Action. Content workflows can produce briefs, proposed page edits and internal-link plans. Review the output before your team makes an external change, then examine later measurements.',
        ],
      },
      {
        heading: 'Connect only what your work needs',
        paragraphs: [
          'Use available search, analytics and provider connections, and read authorized saved evidence in compatible assistants through MCP. You do not need every integration to begin, and opening saved data does not itself refresh a provider or purchase research.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Is every feature included in the free trial?',
        a: 'No. The current trial is a limited AI visibility entry point. Integrations, Agent workflows and project-dependent capabilities have their own access and setup requirements.',
      },
      {
        q: 'Does combining these signals prove what caused a result?',
        a: 'No. The platform provides evidence for investigation. A citation, a visit and a website change are distinct observations.',
      },
    ],
    workflow:
      'Choose a buyer question → inspect its answer and sources → investigate the relevant page or search evidence → prepare a reviewable action → measure later.',
    closing: 'Explore the evidence behind your next AI search decision.',
    related: [],
  },
  {
    path: '/platform/ai-visibility',
    title: 'AI Visibility Tracking & Brand Monitoring | CiteLadder',
    description:
      'Monitor brand mentions and competitor presence across tracked AI questions. Inspect answers, cited sources and visibility changes with CiteLadder.',
    heading: "AI visibility tracking built around your buyers' questions",
    lead: 'See how your brand appears in the AI answers your project measures. Compare competitors, inspect the responses behind a trend and keep the question, engine and collection context in view.',
    sections: [
      {
        heading: 'Build a prompt portfolio that reflects buying decisions',
        paragraphs: [
          'Write or review suggested questions around needs, use cases and comparisons. Organize related prompts by topic and keep branded questions distinct from non-branded discovery. Review suggestions before activating them so the portfolio represents the market you actually serve.',
        ],
      },
      {
        heading: 'Compare visibility without losing the answer',
        paragraphs: [
          'Use Trends to examine your selected run, period, engine and cohort. Move from an aggregate into the underlying response to check whether your brand was mentioned, whether an owned source was cited and whether the answer supports a recommendation or rank.',
        ],
      },
      {
        heading: 'Understand the sources and retrieval context',
        paragraphs: [
          "Inspect cited domains and URLs alongside the answer. Where query fanout was captured, review the associated query evidence. Missing fanout data stays missing; it is not replaced with an invented account of an engine's research.",
        ],
      },
      {
        heading: 'Keep later comparisons interpretable',
        paragraphs: [
          'Historical audits preserve the prompt and measurement context used at collection. Before acting on a change, check whether your question set, engine or successful-answer coverage changed. Use compatible observations to investigate movement rather than treating every difference as a trend.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Does this show every answer every user receives?',
        a: 'No. It shows the answer observations collected for your selected questions and configuration, not a census of all AI conversations.',
      },
      {
        q: 'Is a brand mention the same as a citation?',
        a: 'No. A brand can appear without its website being cited. Source references and brand presence remain separate.',
      },
      {
        q: 'Which engines can I use?',
        a: 'Available engines depend on the supported collection configuration and account access. The current public trial is ChatGPT-only. Provider/API observations must not be described as identical to every consumer-app experience.',
      },
    ],
    workflow:
      'Review prompts → choose available engines and run settings → confirm the audit → inspect Trends and answers → choose a focused investigation.',
    closing: 'Build a visibility baseline your team can inspect.',
    related: [
      '/platform/citation-intelligence',
      '/ai-search-share-of-voice',
      '/ai-citation-tracking',
      '/platform/site-health',
    ],
  },
  {
    path: '/platform/citation-intelligence',
    title: 'AI Citation Tracking Software & Source Analysis | CiteLadder',
    description:
      'Analyze the domains and URLs cited in tracked AI answers. Compare owned and third-party sources and inspect the evidence behind citation patterns.',
    heading: 'See the sources behind your AI visibility',
    lead: 'Find the domains and individual pages referenced in your collected AI answers. Understand whether an answer points to your website, a competitor or another publisher—and inspect the source before deciding what to do next.',
    sections: [
      {
        heading: 'Move from a source pattern to the exact page',
        paragraphs: [
          'A recurring domain is a starting point, not the conclusion. Open its cited URLs and the questions associated with them. Distinguish a product page, technical guide, editorial comparison or other source by examining the actual evidence.',
        ],
      },
      {
        heading: 'Separate brand presence from source use',
        paragraphs: [
          'Your product can be named while an independent publisher receives the citation. Your documentation can also be cited without the brand being recommended. Keep these observations separate when reporting visibility or assigning work.',
        ],
      },
      {
        heading: 'Investigate the answer that used the source',
        paragraphs: [
          'Review citations in their original answer context. Look at your selected prompts and available retrieval evidence before interpreting a source as influential or accurate. A source reference alone does not establish why an engine chose it or whether every surrounding claim is supported.',
        ],
      },
      {
        heading: 'Choose a next step that fits the finding',
        paragraphs: [
          'For owned content, investigate relevance, clarity and applicable Site Health findings. For third-party sources, verify the facts before preparing a correction or editorial brief. Use the Agent to prepare bounded work, not to manufacture a guaranteed route to a citation.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Does a citation mean the engine recommends my brand?',
        a: 'Not necessarily. Read the answer to distinguish a recommendation, comparison and source reference.',
      },
      {
        q: 'Does a citation guarantee a website visit?',
        a: 'No. A reader may never open the source. Use AI Referral Analytics to inspect identifiable visits reported by analytics.',
      },
      {
        q: 'Where can I learn the measurement basics?',
        a: 'Read the AI citation tracking guide for definitions, evidence types and practical interpretation.',
      },
    ],
    workflow:
      'Select answer evidence → inspect domains → open cited URLs → compare source facts → prepare the appropriate action.',
    closing: 'Understand which sources deserve your attention.',
    related: [
      '/platform/ai-visibility',
      '/ai-citation-tracking',
      '/platform/site-health',
      '/platform/ai-referral-analytics',
      '/platform/content-intelligence',
    ],
  },
  {
    path: '/platform/site-health',
    title: 'AEO Website Audit & Technical SEO Checks | CiteLadder',
    description:
      'Investigate technical SEO, content structure and AI crawler permissions with CiteLadder Site Health. Review page evidence and prioritize reviewable fixes.',
    heading: 'Find the website issues behind your next improvement',
    lead: 'Crawl your website and examine technical and content findings in their page context. Site Health helps your team understand what was checked, where an issue applies and which evidence supports a proposed correction.',
    sections: [
      {
        heading: 'Understand the page, not just the score',
        paragraphs: [
          'Open affected pages to inspect captured evidence and page classification. A product page and an editorial article have different purposes, so applicable checks should be read in context. Keep unresolved checks visible instead of treating them as passes.',
        ],
      },
      {
        heading: 'Review technical and AEO findings together',
        paragraphs: [
          "Investigate available checks for website fundamentals and answer-engine readiness, including structure, evidence, machine readability and crawlability. Read the audit's coverage alongside its scores so a partial crawl is not mistaken for a complete assessment.",
        ],
      },
      {
        heading: 'Inspect crawler permissions and robots history',
        paragraphs: [
          'Review robots.txt permissions by crawler purpose, including AI search, training and user-triggered fetches. Compare retained observations when investigating policy changes. Permission to request a page is different from evidence that a crawler visited, indexed or cited it.',
        ],
      },
      {
        heading: 'Turn a finding into a focused fix',
        paragraphs: [
          'Use the relevant Action or Ask agent handoff to prepare a bounded explanation or fix brief. Your team reviews and implements the change. A later crawl can provide new evidence for checking it, subject to comparable coverage.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Does a higher AEO score guarantee AI citations?',
        a: "No. It summarizes applicable checked evidence, not an engine's indexing or source-selection decision.",
      },
      {
        q: 'Is robots permission the same as crawler traffic?',
        a: 'No. Site Health examines policy evidence. Observed bot requests require a separate collection source; do not infer visits from allowed access.',
      },
    ],
    closing: 'Give your developers and content team a clearer starting point.',
    related: [
      '/platform/content-intelligence',
      '/platform/demand-intelligence',
      '/platform/agents',
      '/platform/ai-visibility',
    ],
  },
  {
    path: '/platform/ai-referral-analytics',
    title: 'AI Referral Analytics & ChatGPT Traffic | CiteLadder',
    description:
      'Analyze identifiable AI referral sessions, landing pages, engagement and GA4 key events. Keep website visits separate from citations and crawler requests.',
    heading: 'Understand the visits AI sends to your website',
    lead: 'Use connected GA4 evidence to examine identifiable AI referral sessions, the pages they reach and the engagement or outcomes reported for them. Go beyond counting appearances in AI answers without pretending every visit can be attributed.',
    sections: [
      {
        heading: 'See which recognized AI sources send visits',
        paragraphs: [
          'Review AI-source sessions within the selected reporting window. Compare them with the appropriate property-wide session context, keeping the source definition and data quality visible. Missing attribution is not proof that no AI-influenced visit occurred.',
        ],
      },
      {
        heading: 'Find the landing pages worth investigating',
        paragraphs: [
          'Move from source-level totals into landing pages. Inspect the pages receiving sessions and the available engagement and key-event evidence. Keep project-owned landing-page scope distinct from property-wide channel totals.',
        ],
      },
      {
        heading: 'Examine outcomes without inventing a funnel',
        paragraphs: [
          "Review available engaged sessions, GA4 key events, transactions and purchase revenue in the property's recorded currency. Key events use your GA4 configuration. They are not automatically equivalent to leads, and event counts should not be relabeled as a session conversion rate.",
        ],
      },
      {
        heading: 'Connect page evidence while preserving the distinctions',
        paragraphs: [
          'Use available page-level views to inspect referral observations alongside tracked citations and Site Health findings. A visit, a cited answer and a crawler request remain different units; proximity in time does not prove a causal journey.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Can this identify all traffic influenced by AI?',
        a: 'No. It analyzes identifiable sources in connected analytics. Visits with missing or unrecognized attribution cannot be confidently relabeled.',
      },
      {
        q: 'Do I need crawl logs to analyze referrals?',
        a: 'No. Referral analysis is GA4-backed. Crawler-request collection is a separate capability with separate setup and availability.',
      },
    ],
    closing: 'See what happens after an identifiable AI visit arrives.',
    related: [
      '/platform/integrations',
      '/platform/citation-intelligence',
      '/platform/site-health',
      '/platform/demand-intelligence',
    ],
  },
  {
    path: '/platform/demand-intelligence',
    title: 'Search Demand & GSC Opportunity Analysis | CiteLadder',
    description:
      'Turn first-party search queries and landing-page evidence into opportunities. Investigate CTR gaps, competing pages and demand changes with CiteLadder.',
    heading: 'Find the opportunities already present in your search data',
    lead: 'Use first-party search evidence to understand which queries reach your pages and which patterns deserve attention. Demand Intelligence helps turn those observations into focused investigations rather than another unprioritized keyword list.',
    sections: [
      {
        heading: 'Investigate queries in their landing-page context',
        paragraphs: [
          'Review the relationship between observed queries and owned pages. Use the recorded reporting window and source evidence to understand what a page is appearing for before deciding how its content should change.',
        ],
      },
      {
        heading: 'Surface useful search-demand signals',
        paragraphs: [
          'Inspect available striking-distance opportunities, property-relative click-through-rate gaps, competing-page patterns and coverage-qualified changes between windows. Keep branded demand distinct from unbranded acquisition opportunities, and retain unknown or ambiguous states.',
        ],
      },
      {
        heading: 'Examine relevance before prescribing a rewrite',
        paragraphs: [
          'Where the page can be resolved and inspected, use available title, H1 and content evidence to understand query-page alignment. A missing term can support investigation; it does not prove what caused a click-through-rate difference.',
        ],
      },
      {
        heading: 'Move from a signal to a reviewable action',
        paragraphs: [
          'Open the evidence behind a promoted page Action. Use an Agent workflow to prepare a focused page edit or brief, then have your team review the change. Later comparable evidence can help evaluate what happened next.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Is this a database of private AI conversations?',
        a: 'No. Demand Intelligence uses connected first-party search evidence. Generated tracking prompts are suggestions, not observed global AI demand volumes.',
      },
      {
        q: 'How is this different from Search Intelligence?',
        a: 'Demand Intelligence examines your connected first-party observations. Search Intelligence adds separately reviewed external keyword, competitor and backlink datasets.',
      },
    ],
    closing: 'Use the search evidence you already have to choose better work.',
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
      'Research keywords, competing domains, top pages and backlinks with optional DataForSEO datasets. Review scope and cost before collecting new evidence.',
    heading: 'Put keyword and backlink research beside your AI evidence',
    lead: 'Add external search research when a question needs more than your own analytics. Search Intelligence organizes reviewed keyword, competitor and backlink datasets so your team can investigate opportunities in their original scope.',
    sections: [
      {
        heading: 'Research your domain and relevant competitors',
        paragraphs: [
          'Inspect saved keyword, competitor and top-page evidence for the selected market and domain scope. Keep provider estimates and coverage visible, and distinguish purchased dataset rows from a claim to complete market visibility.',
        ],
      },
      {
        heading: 'Investigate backlinks and citation overlap',
        paragraphs: [
          'Review available backlink summaries, referring domains and saved link detail. Where a selected backlink dataset can be matched to selected visibility audits, inspect the resulting citation overlap. Overlap is evidence for investigation, not proof that a backlink caused a citation.',
        ],
      },
      {
        heading: 'Review scope and cost before collecting data',
        paragraphs: [
          'New DataForSEO research uses a review-and-confirm workflow. Inspect the target, scope and maximum cost before authorizing collection. Opening an existing dataset does not silently buy a refresh, and missing results are not rewritten as measured zero.',
        ],
      },
      {
        heading: 'Carry useful evidence into content work',
        paragraphs: [
          'Select relevant saved research and open a read-only handoff for content work. The evidence remains identifiable; opening that handoff is not permission to generate or publish a draft.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Is this included in every free trial?',
        a: 'Do not assume so. It requires the relevant access, provider setup and explicit research confirmation. Contact us to discuss your use case.',
      },
      {
        q: 'Are search volumes the number of people asking an AI assistant?',
        a: "No. External search metrics and estimates are not a census of private AI conversations. Keep the dataset's original definition.",
      },
    ],
    closing: 'Research the questions your existing evidence cannot answer.',
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
    path: '/platform/commerce-intelligence',
    title: 'AI Product Visibility & Share of Shelf | CiteLadder',
    description:
      'Measure product and category appearances in AI answers with CiteLadder AI Shelf. Review buyer prompts, competitors and supported recommendation positions.',
    heading: 'Understand how your products appear in AI buying answers',
    lead: 'For eligible commerce projects, connect a product or category to target-specific buyer prompts and inspect its recorded appearances. AI Shelf helps keep product identity, competitors and recommendation evidence together.',
    sections: [
      {
        heading: 'Begin with a product or category you can identify',
        paragraphs: [
          'Review the catalog target and its website page. Check competitor candidates before approving them for measurement. A product and a category represent different buying contexts, so keep the selected target explicit.',
        ],
      },
      {
        heading: 'Review buyer prompts before measuring',
        paragraphs: [
          'Prepare relevant product or category questions and approve the prompts you intend to use. Review available engines, repetitions and estimated cost before launching an audit. The run retains its catalog and competitor context.',
        ],
      },
      {
        heading: 'Interpret visibility and shelf position carefully',
        paragraphs: [
          'Review Product Visibility and Share of Shelf in the measured answer set. Position metrics apply only where the evidence supports an explicit ordering. An unordered list or prose recommendation is not a reliable numbered ranking.',
        ],
      },
      {
        heading: 'Investigate what the answer actually recommends',
        paragraphs: [
          "Read the supporting answer and distinguish product identity, merchant domain and citation URL. Compare the question with the product page's confirmed facts before preparing a proposed improvement.",
        ],
      },
    ],
    faqs: [
      {
        q: 'Does this track every shopping carousel in every consumer assistant?',
        a: "No. The page describes product/category observations under CiteLadder's supported audit configuration, not exhaustive shopping-surface coverage.",
      },
      {
        q: 'Does this require or include native Shopify synchronization?',
        a: 'Do not assume a Shopify connection. The current catalog approach uses supported website evidence and CSV workflows; native Shopify synchronization is not being advertised.',
      },
      {
        q: 'Is Commerce available for every project?',
        a: "No. Eligibility depends on the project's required capability evidence and access. Discuss your catalog and measurement needs in a demo.",
      },
    ],
    closing: 'Explore the buyer questions surrounding your catalog.',
    related: [
      '/platform/ai-visibility',
      '/platform/citation-intelligence',
      '/platform/content-intelligence',
      '/solutions#commerce',
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
