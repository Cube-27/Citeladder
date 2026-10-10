import { TRIAL_NOTE, type PlatformPage } from './platform-page-types';

/** The overview and the measurement capabilities. */
export const MEASURE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform',
    title: 'AI Search Intelligence Platform | CiteLadder',
    description:
      'One project for AI visibility, citation analysis, site health, search data, referral analytics and reviewable content work.',
    heading: 'One platform from AI answer to shipped fix.',
    lead: 'Track how AI engines answer your buyers, trace every result to the pages behind it, and turn what you find into work your team can review and ship.',
    cta: 'trial',
    visual: 'visibility',
    visualTitle: 'AI Visibility',
    note: TRIAL_NOTE,
    highlights: [
      {
        title: 'Measure',
        body: 'Brand visibility, citations, referral visits and product shelf position across the answers you track.',
      },
      {
        title: 'Diagnose',
        body: 'Site Health findings, first-party search signals and optional keyword and backlink research.',
      },
      {
        title: 'Improve',
        body: 'Agent-prepared briefs, page edits and plans, plus MCP access from the assistants you already use.',
      },
    ],
    features: [
      {
        title: 'Every result traces back to its evidence.',
        body: 'Numbers open the answer, source or page they came from. Mentions, citations and visits stay separate, so nobody mistakes one signal for another.',
        points: [
          'Recorded answers with engine, prompt and date',
          'Cited domains and URLs, classified by type',
          'Comparable audits over time',
        ],
        visual: 'answer',
      },
      {
        title: 'Findings become ranked, reviewable work.',
        body: 'Site, demand and visibility evidence rolls up into Actions per page. The Agent drafts the brief; your team decides what ships.',
        points: [
          'One Action per target page',
          'Briefs and edits grounded in saved evidence',
          'Nothing publishes on its own',
        ],
        visual: 'actions',
      },
    ],
    faqs: [
      {
        q: 'Is every capability in the free trial?',
        a: 'No. The trial covers AI visibility on ChatGPT for seven days. Integrations, the Agent and project-dependent capabilities like Commerce have their own access and setup.',
      },
      {
        q: 'Does combining signals prove what caused a result?',
        a: 'No. CiteLadder keeps citations, visits and site changes as separate observations so your team can check each one on its own.',
      },
    ],
    closing: 'See what AI says about your brand.',
    related: [
      '/platform/ai-visibility',
      '/platform/citation-intelligence',
      '/platform/ai-referral-analytics',
      '/platform/commerce-intelligence',
      '/platform/site-health',
      '/platform/demand-intelligence',
      '/platform/search-intelligence',
      '/platform/content-intelligence',
      '/platform/agents',
      '/platform/mcp',
      '/platform/integrations',
    ],
  },
  {
    path: '/platform/ai-visibility',
    title: 'AI Visibility Tracking & Brand Monitoring | CiteLadder',
    description:
      'Track brand mentions, position and competitors across the AI answers your buyers see, with every result tied to its recorded answer.',
    heading: 'See how often AI recommends you.',
    lead: 'Track your brand across the questions buyers ask ChatGPT, Gemini, Claude and Google AI Overviews. Compare competitors, follow the trend, and open the exact answer behind every number.',
    cta: 'trial',
    visual: 'visibility',
    visualTitle: 'AI Visibility',
    note: TRIAL_NOTE,
    highlights: [
      {
        title: 'Prompts built around buying',
        body: 'Build a portfolio around needs, use cases and comparisons, with branded and unbranded questions kept apart.',
      },
      {
        title: 'Competitors side by side',
        body: 'Visibility share and average position for you and the brands you choose to track.',
      },
      {
        title: 'The answer behind every score',
        body: 'Every trend point opens the recorded answer, its engine and the sources it cited.',
      },
    ],
    features: [
      {
        title: 'Start from the questions your buyers ask.',
        body: 'Write prompts or review suggestions grouped by topic and buying stage. Nothing is tracked until you approve it, so the portfolio holds only the questions you chose.',
        points: [
          'Suggestions reviewed before they run',
          'Branded and discovery questions kept distinct',
          'Topics that keep large portfolios readable',
        ],
        visual: 'prompts',
      },
      {
        title: 'Read the answer behind the trend.',
        body: 'Open any result to see whether your brand was mentioned, where it ranked and whether your own pages were cited. Query fan-out appears when it was captured, and stays empty when it was not.',
        points: [
          'Mention, position and citation per answer',
          'Engine and collection date on every record',
          'Missing data shown as missing, never zero',
        ],
        visual: 'answer',
      },
    ],
    faqs: [
      {
        q: 'Does this show every answer every user gets?',
        a: 'No. It shows the answers collected for your prompts and settings, which is a consistent sample you can compare over time, not a census of every conversation.',
      },
      {
        q: 'Is a mention the same as a citation?',
        a: 'No. A brand can be named without its site being cited, and a page can be cited without the brand being recommended. CiteLadder tracks both separately.',
      },
      {
        q: 'Which engines can I use?',
        a: 'ChatGPT, Gemini, Claude and Google AI Overviews, depending on your plan. The free trial is ChatGPT only. Collected answers can differ from what a signed-in user sees.',
      },
    ],
    closing: 'Get your AI visibility baseline.',
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
      'See which domains and pages AI answers cite, compare owned and third-party sources, and read each citation in its original answer.',
    heading: 'Know which pages AI answers cite.',
    lead: 'See every domain and URL your tracked answers reference, whether it belongs to you, a competitor or a publisher, and read each citation in the answer that used it.',
    cta: 'demo',
    visual: 'sources',
    visualTitle: 'Sources',
    highlights: [
      {
        title: 'Domains and URLs',
        body: 'Move from a recurring domain to the exact pages cited and the prompts that cited them.',
      },
      {
        title: 'Classified sources',
        body: 'Owned, review, editorial, community and competitor sources, counted separately.',
      },
      {
        title: 'In context',
        body: 'Every citation opens the answer it supported, so you can judge what it was used for.',
      },
    ],
    features: [
      {
        title: 'From a source pattern to the exact page.',
        body: 'A domain that keeps appearing is a starting point. Open its cited URLs and the questions behind them to see whether it is a product page, a guide or an independent comparison.',
        points: [
          'Domain and URL views of the same citations',
          'Prompts and engines per source',
          'Source mix across the whole portfolio',
        ],
        visual: 'cited-url',
      },
      {
        title: 'Brand presence and source use are different.',
        body: 'Your product can be named while a reviewer gets the citation. Your docs can be cited without a recommendation. Seeing both tells you whether to fix a page or reach a publisher.',
        points: [
          'Mentions and citations reported separately',
          'Owned citations highlighted per answer',
          'Facts checked before any outreach brief',
        ],
        visual: 'answer',
      },
    ],
    faqs: [
      {
        q: 'Does a citation mean the engine recommends my brand?',
        a: 'Not necessarily. Read the answer to tell a recommendation from a comparison or a passing reference.',
      },
      {
        q: 'Does a citation guarantee a visit?',
        a: 'No. Many readers never open the source. AI Referral Analytics shows the visits your analytics can identify.',
      },
      {
        q: 'Where can I learn the method?',
        a: 'Our AI citation tracking guide covers definitions, evidence types and how to interpret results.',
      },
    ],
    closing: 'Find out which sources shape your answers.',
    related: [
      '/platform/ai-visibility',
      '/ai-citation-tracking',
      '/platform/site-health',
      '/platform/ai-referral-analytics',
      '/platform/content-intelligence',
    ],
  },
  {
    path: '/platform/ai-referral-analytics',
    title: 'AI Referral Analytics & ChatGPT Traffic | CiteLadder',
    description:
      'See the visits ChatGPT, Gemini and other AI assistants send to your site, the pages they land on and what happens next, from your GA4 data.',
    heading: 'See the traffic AI sends your way.',
    lead: 'Connect GA4 to see sessions from recognized AI assistants, the pages they land on, and the engagement and key events that follow.',
    cta: 'setup',
    visual: 'referrals',
    visualTitle: 'AI Traffic · Referrals',
    highlights: [
      {
        title: 'By assistant',
        body: 'Sessions from recognized AI sources within your reporting window, beside property-wide context.',
      },
      {
        title: 'By landing page',
        body: 'Which pages AI visitors reach, with engagement and key events for each.',
      },
      {
        title: 'Outcomes as reported',
        body: "Engaged sessions, key events and purchase revenue in your property's own currency.",
      },
    ],
    features: [
      {
        title: 'Find the pages AI visitors land on.',
        body: 'Move from source totals to landing pages and compare engagement. Page-level scope stays distinct from property-wide channel totals.',
        points: [
          'Sessions and engaged sessions per source',
          'Landing pages ranked by AI sessions',
          'Data quality notes kept beside the numbers',
        ],
        visual: 'page-report',
      },
    ],
    faqs: [
      {
        q: 'Can this find all traffic influenced by AI?',
        a: 'No. It reports sources your analytics can identify. Visits with missing attribution stay unknown rather than being relabeled.',
      },
      {
        q: 'Are key events the same as leads?',
        a: 'They follow your GA4 configuration. CiteLadder reports them as configured and does not turn event counts into conversion rates.',
      },
    ],
    closing: 'See what happens after an AI assistant sends a visit.',
    related: [
      '/platform/integrations',
      '/platform/citation-intelligence',
      '/platform/site-health',
      '/platform/demand-intelligence',
    ],
  },
  {
    path: '/platform/commerce-intelligence',
    title: 'AI Product Visibility & Share of Shelf | CiteLadder',
    description:
      'Measure how your products and categories appear in AI buying answers, including share of shelf where answers rank products explicitly.',
    heading: 'See how your products show up in AI buying answers.',
    lead: 'For eligible commerce projects, track a product or category across buyer prompts, compare it with competing products, and see where answers rank it.',
    cta: 'demo',
    visual: 'commerce',
    visualTitle: 'AI Shelf',
    note: 'Commerce depends on project eligibility. Book a demo to check your catalog.',
    highlights: [
      {
        title: 'Products and categories',
        body: 'Measure a specific product or a whole category against the competitors you approve.',
      },
      {
        title: 'Share of shelf',
        body: 'Position is reported only when the answer ranks products explicitly.',
      },
      {
        title: 'What was recommended',
        body: 'Product identity, merchant domain and cited URL, kept apart.',
      },
    ],
    features: [
      {
        title: 'Review prompts and rivals before you measure.',
        body: 'Approve the buyer prompts and competitor products for each target, check engines and repetitions, then run. Each run keeps its catalog and competitor context.',
        points: [
          'Target-specific buyer prompts',
          'Competitor candidates you approve',
          'Cost estimate before launch',
        ],
        visual: 'shelf-setup',
      },
    ],
    faqs: [
      {
        q: 'Does this cover every place AI shows products?',
        a: "No. It reports product and category answers under CiteLadder's supported audits, not every shopping carousel in every assistant.",
      },
      {
        q: 'Do I need a Shopify connection?',
        a: 'No. Catalog targets come from your website and CSV workflows. A native Shopify sync is not offered.',
      },
    ],
    closing: 'Explore the buyer questions around your catalog.',
    related: [
      '/platform/ai-visibility',
      '/platform/citation-intelligence',
      '/platform/content-intelligence',
      '/solutions#commerce',
    ],
  },
];
