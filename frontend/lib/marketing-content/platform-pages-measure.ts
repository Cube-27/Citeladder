import { TRIAL_NOTE, type PlatformPage } from './platform-page-types';

/** The overview and AI answer measurement: visibility and citations. */
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
        body: 'Brand mentions, position, citations, sentiment and ads across ChatGPT, Gemini, Claude and Google AI Overviews, plus the AI visits and crawlers your own data records.',
      },
      {
        title: 'Diagnose',
        body: 'Site Health crawls, Search Console and GA4 signals, and optional keyword and backlink research, each tied to the page it concerns.',
      },
      {
        title: 'Improve',
        body: 'Ranked Actions per page, Agent-prepared briefs and edits, and read-only MCP access from the assistants your team already uses.',
      },
    ],
    features: [
      {
        title: 'Every number opens the evidence behind it.',
        body: 'A visibility score is only useful if you can check it. In CiteLadder every trend point opens the recorded answer, the engine and date it came from, and the sources it cited. Mentions, citations, sentiment, ads and visits stay separate, so nobody reads one signal as another.',
        points: [
          'Recorded answers with engine, prompt and collection date',
          'Cited domains and URLs, classified by who owns them',
          'Comparable audits on the same prompts over time',
          'Missing data shown as missing, never as zero',
        ],
        visual: 'answer',
      },
      {
        title: 'See how answers talk about you, not only whether they do.',
        body: 'Perception reads each tracked answer for sentiment, the themes it praises or criticizes, and whether it actually recommends you. On ChatGPT Search, Ads shows which advertisers appear beside your prompts, recorded apart from citations so paid placements never inflate a score.',
        points: [
          'Net sentiment with how many answers were classified',
          'Themes such as pricing, support and ease of use, with verbatim quotes',
          'Recommended rate beside mention rate',
          'Advertisers, ad presence and your own ad share',
        ],
        visual: 'perception',
      },
      {
        title: 'Connect answers to what happens on your site.',
        body: 'Read GA4 sessions from recognized AI assistants and, on paid plans, your own server logs for AI crawler requests. Site Health shows which of those crawlers your robots.txt allows. Together they show whether engines can reach a page, whether they fetch it, and whether people arrive.',
        points: [
          'AI referral sessions, landing pages and key events from GA4',
          'Verified AI crawler requests from Cloudflare, CloudFront, Google Cloud, a webhook or an upload',
          'robots.txt access by crawler purpose',
        ],
        visual: 'crawlers',
      },
      {
        title: 'Findings become ranked, reviewable work.',
        body: 'Site, demand, citation and visibility evidence rolls up into one Action per target page, ranked by deterministic rules rather than a model’s opinion. Hand any Action to the Agent for a brief or edit. Your team decides what ships, then later evidence shows what changed.',
        points: [
          'One Action per page, query, prompt or product',
          'Briefs and edits grounded in saved evidence',
          'Nothing publishes or contacts anyone on its own',
          'Implemented work measured against fresh evidence',
        ],
        visual: 'actions',
      },
    ],
    steps: [
      {
        title: 'Set up a project',
        body: 'Add your site. CiteLadder researches your company and competitors, and you confirm the context before anything runs.',
      },
      {
        title: 'Approve your prompts',
        body: 'Review suggested buyer questions by topic and stage, or write your own. Only the prompts you accept are tracked.',
      },
      {
        title: 'Collect and connect',
        body: 'Run audits on a schedule, crawl your site, and connect Search Console, GA4 or crawler logs when you want them.',
      },
      {
        title: 'Act and verify',
        body: 'Work through ranked Actions with the Agent, implement what you approve, and check the result in the next collection.',
      },
    ],
    questions: [
      'Which AI engines mention us for the questions our buyers ask, and which competitors do they name instead?',
      'Which pages and publishers do AI answers cite when they talk about our category?',
      'Do answers describe us positively, and what do they criticize?',
      'Can AI crawlers reach our key pages, and do they actually fetch them?',
      'How much traffic do AI assistants send us, and to which pages?',
      'What should we fix or write next, and on which page?',
    ],
    faqs: [
      {
        q: 'What does CiteLadder do?',
        a: 'CiteLadder tracks how AI engines answer the questions your buyers ask, shows which sources those answers cite, and connects that evidence with your site, search and analytics data. It then turns the findings into ranked, reviewable work for your team.',
      },
      {
        q: 'Which AI engines does CiteLadder track?',
        a: 'ChatGPT, Gemini, Claude and Google AI Overviews. ChatGPT and Gemini are collected from their consumer answers as well as their APIs; Claude is collected through its API. Which engines a project uses depends on its plan and configuration.',
      },
      {
        q: 'Is every capability in the free trial?',
        a: 'No. The trial covers AI visibility on ChatGPT for seven days. Integrations, AI crawler logs, the Agent and project-dependent capabilities like Commerce have their own access and setup.',
      },
      {
        q: 'How is this different from an SEO tool?',
        a: 'SEO tools report rankings on a results page. CiteLadder records what AI engines actually say, who they name and which pages they cite, then places that beside Site Health, Search Console and GA4 so you can see where classic search and AI answers agree or differ.',
      },
      {
        q: 'Does combining signals prove what caused a result?',
        a: 'No. CiteLadder keeps citations, visits, crawler requests and site changes as separate observations so your team can check each one on its own. Patterns are labeled as co-occurrence, not cause.',
      },
      {
        q: 'Will CiteLadder change my website?',
        a: 'No. CiteLadder reads your site and data. The Agent drafts briefs and edits for your team to review, and nothing is published, sent or changed on your behalf.',
      },
      {
        q: 'Can I use CiteLadder from Claude or ChatGPT?',
        a: 'Yes. The CiteLadder MCP server gives compatible assistants read-only access to the workspaces you approve, so you can ask about your visibility, sources and site evidence in plain language.',
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
      'Track brand mentions, position, sentiment and competitors across ChatGPT, Gemini, Claude and Google AI Overviews, with every result tied to its recorded answer.',
    heading: 'See how often AI recommends you.',
    lead: 'Track your brand across the questions buyers ask ChatGPT, Gemini, Claude and Google AI Overviews. Compare competitors, follow the trend, and open the exact answer behind every number.',
    cta: 'trial',
    visual: 'visibility',
    visualTitle: 'AI Visibility',
    note: TRIAL_NOTE,
    highlights: [
      {
        title: 'Prompts built around buying',
        body: 'A portfolio organized by topic, buyer stage and intent, with branded and unbranded questions kept apart.',
      },
      {
        title: 'Competitors side by side',
        body: 'Visibility, average position, share of voice and citations for you and every brand you track.',
      },
      {
        title: 'The answer behind every score',
        body: 'Every trend point opens the recorded answer, its engine and the sources it cited.',
      },
    ],
    features: [
      {
        title: 'Start from the questions your buyers ask.',
        body: 'Generate suggestions from your site and competitors, build a portfolio with the Agent, import a CSV or write prompts yourself. Suggestions cover awareness, consideration, decision and implementation, and are checked for quality before you see them. When Search Console or keyword research is connected, generation uses how your buyers already search to phrase suggestions. Nothing is tracked until you accept it.',
        points: [
          'Suggestions grouped by topic and buyer stage',
          'Unbranded discovery prompts never name you or a competitor',
          'Branded and comparison prompts tracked separately',
          'Accept or reject suggestions in bulk',
        ],
        visual: 'prompts',
      },
      {
        title: 'One portfolio across every engine.',
        body: 'Run the same prompts across ChatGPT, Gemini, Claude and Google AI Overviews and compare how each one treats your brand. Repeat each prompt several times per run to smooth out answer variation, and schedule runs so the trend stays comparable.',
        points: [
          'Consumer answers and model APIs, labeled by surface',
          'Repetitions per prompt to measure consistency',
          'One-off, hourly, daily or weekly schedules',
          'Metrics state how many answers they are based on',
        ],
        visual: 'engines',
      },
      {
        title: 'Read the answer behind the trend.',
        body: 'Open any result to see whether your brand was mentioned, where it ranked among the brands named and whether your own pages were cited. Query fan-out shows the searches an engine ran when it exposes them, and stays marked unavailable when it does not.',
        points: [
          'Mention, position and citation per answer',
          'Engine and collection date on every record',
          'Query fan-out where the engine returns it',
          'Missing data shown as missing, never zero',
        ],
        visual: 'answer',
      },
      {
        title: 'Know how answers describe you.',
        body: 'Perception classifies each answer’s sentiment toward you and your competitors, groups what it says into themes like pricing, quality and support, and keeps the quotes that support each theme. Recommended rate shows how often you are actually recommended, not just named.',
        points: [
          'Net sentiment from −100 to +100, with classified counts',
          'Positive and negative themes with verbatim quotes',
          'Sources cited beside criticism',
          'Included with visibility tracking, no extra credits',
        ],
        visual: 'perception',
      },
      {
        title: 'See who is paying to appear beside your prompts.',
        body: 'ChatGPT Search can show sponsored placements next to an answer. CiteLadder records them apart from citations: which advertisers appear, on which prompts, and how often. Ads never count as citations or change your visibility scores.',
        points: [
          'Ad presence across your tracked prompts',
          'Advertisers, appearances and share',
          'Your own ad share, or “Not advertising”',
        ],
        visual: 'ads',
      },
    ],
    steps: [
      {
        title: 'Choose your competitors',
        body: 'Confirm the brands you want to compare against. Each one has its own rules for what counts as a mention.',
      },
      {
        title: 'Build the portfolio',
        body: 'Accept suggested prompts or bring your own, organized into topics that keep large portfolios readable.',
      },
      {
        title: 'Run on a schedule',
        body: 'Collect answers across your engines with repetitions, once or on a recurring schedule.',
      },
      {
        title: 'Read and act',
        body: 'Follow trends, open the answers behind them, and send what you find to Actions and the Agent.',
      },
    ],
    questions: [
      'How often do ChatGPT and Gemini mention us for unbranded category questions?',
      'Which competitor is named first when buyers ask for a recommendation?',
      'Does Google AI Overviews cite our pages or a reviewer’s?',
      'What do AI answers criticize about our pricing or support?',
      'Did our visibility change after last month’s content update?',
      'Which competitors are buying ads beside our prompts in ChatGPT?',
    ],
    faqs: [
      {
        q: 'Which engines can I track?',
        a: 'ChatGPT, Gemini, Claude and Google AI Overviews, depending on your plan. ChatGPT and Gemini can be tracked from their consumer answers and from their APIs. The free trial is ChatGPT only. Collected answers can differ from what a signed-in user sees.',
      },
      {
        q: 'Does this show every answer every user gets?',
        a: 'No. It shows the answers collected for your prompts and settings, which is a consistent sample you can compare over time, not a census of every conversation.',
      },
      {
        q: 'Is a mention the same as a citation?',
        a: 'No. A brand can be named without its site being cited, and a page can be cited without the brand being recommended. CiteLadder tracks both separately.',
      },
      {
        q: 'What do visibility and share of voice mean?',
        a: 'Visibility is the share of collected answers that mention your brand. Share of voice is your share of all brand mentions across those answers, so it moves when competitors gain or lose ground too.',
      },
      {
        q: 'Why repeat the same prompt?',
        a: 'AI answers vary from one request to the next. Repeating each prompt within a run shows how consistently you appear instead of relying on a single answer.',
      },
      {
        q: 'How is sentiment measured?',
        a: 'Each answer is classified for how it describes each brand, and the result is shown with how many answers were classified. Themes and quotes come from the answers themselves, so you can check every judgment.',
      },
      {
        q: 'Do ads affect my visibility score?',
        a: 'No. Ads are recorded separately on ChatGPT Search and never count as mentions, citations or position. Other engines show ads as not applicable.',
      },
      {
        q: 'Where do prompt suggestions come from?',
        a: 'From your site, your competitors and the topics you choose. When Search Console or keyword research is connected, suggestions are also phrased after real searches from your buyers, without copying any search exactly. Suggestions are checked for quality and staged for review, and you can also import prompts from a CSV file.',
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
      'See which domains and pages AI answers cite, compare owned and third-party sources, and find cited pages that list competitors but not you.',
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
        body: 'Owned, competitor, review, editorial, community, social, video and institutional sources, counted separately.',
      },
      {
        title: 'Earned opportunities',
        body: 'Cited pages that list your competitors but not you, with the passage that names them.',
      },
    ],
    features: [
      {
        title: 'From a source pattern to the exact page.',
        body: 'A domain that keeps appearing is a starting point. Open its cited URLs and the questions behind them to see whether it is a product page, a guide or an independent comparison, and which engines rely on it.',
        points: [
          'Domain and URL views of the same citations',
          'Prompts and engines per source',
          'Source mix across the whole portfolio',
        ],
        visual: 'cited-url',
      },
      {
        title: 'Find the third-party pages that leave you out.',
        body: 'After an audit, CiteLadder reads the third-party pages your answers cite, respecting robots.txt. When a recurring listicle, comparison, directory or review page names your competitors but not you, it becomes an Action with the quoted passage attached, ready for an outreach brief.',
        points: [
          'Brand and competitor presence on each cited page',
          'Quoted passages as evidence',
          'One Action per page worth earning',
          'Outreach drafted by the Agent, never sent for you',
        ],
        visual: 'earned',
      },
      {
        title: 'Brand presence and source use are different.',
        body: 'Your product can be named while a reviewer gets the citation. Your docs can be cited without a recommendation. Seeing both tells you whether to fix a page on your site or reach a publisher.',
        points: [
          'Mentions and citations reported separately',
          'Owned citations highlighted per answer',
          'Citation rate measured only where sources were returned',
        ],
        visual: 'answer',
      },
    ],
    steps: [
      {
        title: 'Collect answers',
        body: 'Every tracked answer keeps the sources the engine cited, by domain and URL.',
      },
      {
        title: 'Classify sources',
        body: 'Each source is labeled as owned, competitor or a type of third party.',
      },
      {
        title: 'Read cited pages',
        body: 'Recurring third-party pages are read to see which brands they list.',
      },
      {
        title: 'Plan the work',
        body: 'Improve your own cited pages, or brief outreach to the publishers that matter.',
      },
    ],
    questions: [
      'Which publishers do AI engines trust most in our category?',
      'Which of our own pages get cited, and for which questions?',
      'Which “best of” lists name our competitors but not us?',
      'Does ChatGPT cite different sources than Google AI Overviews?',
      'Are review sites or community threads shaping answers about us?',
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
        q: 'How are sources classified?',
        a: 'Each cited domain is labeled as your own, a competitor’s, or a third party such as a review marketplace, editorial publisher, community, social network, video platform or institution.',
      },
      {
        q: 'What is an earned source opportunity?',
        a: 'A third-party page that AI answers cite repeatedly, which lists one or more competitors but not you. CiteLadder reads the page, keeps the passage that names them, and raises one Action for it.',
      },
      {
        q: 'Will CiteLadder contact publishers for me?',
        a: 'No. The Agent can draft an outreach brief from the evidence. Your team decides whether and how to approach the publisher.',
      },
      {
        q: 'Do all engines return citations?',
        a: 'No. Some answers come without sources. Citation rate is measured only over answers where sources were returned, so an engine without sources does not read as zero citations.',
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
];
