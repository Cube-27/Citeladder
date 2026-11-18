import { TRIAL_NOTE, type PlatformPage } from './platform-page-types';

/** The overview and AI answer measurement: visibility and citations. */
export const MEASURE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform',
    updated: '2026-11-11',
    title: 'AI Search Visibility Platform | CiteLadder',
    description:
      'See how ChatGPT, Gemini, Claude and Google AI Overviews answer your buyers, which pages they cite, and a ranked list of what to change on your site.',
    heading: 'Find out what AI tells your buyers about you',
    lead: 'See what ChatGPT, Gemini, Claude and Google AI Overviews say about your business, and what to change to get recommended.',
    cta: 'trial',
    screen: 'visibility',
    note: TRIAL_NOTE,
    highlights: [
      {
        title: 'Measure',
        body: 'You use this when you need to know whether AI answers name you. It records each answer with your mentions, position, citations, sentiment and any ads, plus the AI visits and crawler requests in your own data.',
      },
      {
        title: 'Diagnose',
        body: 'You use this when a page is not getting cited or visited. It shows that page’s crawl findings, Search Console queries and GA4 sessions, with optional keyword and backlink research.',
      },
      {
        title: 'Improve',
        body: 'You use this when you know what is wrong and need the work done. It gives you ranked Actions, one per page or per repeated site defect, the content angles competitor and publisher pages are cited for and your site lacks, briefs and edits drafted by the Agent, and MCP access for confirmed changes from Claude or ChatGPT.',
      },
    ],
    features: [
      {
        title: 'Every number opens the answer behind it',
        body: 'Click any point on a trend and you get the recorded answer: the engine, the prompt, the date it was collected and the sources it cited. Mentions, citations, sentiment, ads and visits are counted separately, so one never stands in for another.',
        points: [
          'Recorded answers with engine, prompt and collection date',
          'Cited domains and URLs, classified by who owns them',
          'Comparable audits on the same prompts over time',
          'Missing data shown as missing, never as zero',
        ],
        media: { kind: 'split', screen: 'answer' },
      },
      {
        title: 'Read how answers describe you',
        body: 'Perception reads each tracked answer for sentiment, the themes it praises or criticizes, and whether it recommends you. On ChatGPT Search, Ads lists the advertisers shown beside your prompts. Ads are recorded apart from citations and never count toward a score.',
        points: [
          'Net sentiment with how many answers were classified',
          'Themes such as pricing, support and ease of use, with verbatim quotes',
          'Recommended rate beside mention rate',
          'Advertisers, ad presence and your own ad share',
        ],
        media: { kind: 'split', screen: 'perception' },
      },
      {
        title: 'Check whether AI crawlers and visitors reach your pages',
        body: 'GA4 shows the sessions AI assistants send you. On paid plans, your server logs show which AI crawlers requested which pages. Site Health shows which crawlers your robots.txt allows. Read together, they tell you whether an engine can reach a page, whether it fetched it and whether people arrived.',
        points: [
          'AI referral sessions, landing pages and key events from GA4',
          'Verified AI crawler requests from Cloudflare, CloudFront, Google Cloud, a webhook or an upload',
          'robots.txt access by crawler purpose',
        ],
        media: { kind: 'split', screen: 'crawler-access' },
      },
      {
        title: 'Get one ranked Action per page or issue',
        body: 'CiteLadder groups site, search, citation and visibility findings into one Action for each page, query, prompt or product, and a technical defect that repeats across pages becomes one Action for all of them. Fixed scoring rules set the order. Send an Action to the Agent for a brief or an edit. Your team decides what ships, and the next collection shows whether it changed anything.',
        points: [
          'One Action per page, repeated defect, query, prompt or product',
          'Briefs and edits built from saved answers and crawl data',
          'Nothing is published or sent without you',
          'Shipped work checked against the next collection',
        ],
        media: { kind: 'full', screen: 'actions' },
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
        body: 'Run audits and site crawls on a schedule, and connect Search Console, GA4 or crawler logs when you want them.',
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
        a: 'CiteLadder sends the questions your buyers ask to ChatGPT, Gemini, Claude and Google AI Overviews, and records each answer, the brands it names and the sources it cites. It shows that beside your site crawl, Search Console and GA4 data, then lists the changes to make, ranked, for your team to review.',
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
        a: 'An SEO tool reports where your pages rank on a results page. CiteLadder records what AI engines say, which brands they name and which pages they cite, and shows it next to Site Health, Search Console and GA4. You can see where search rankings and AI answers agree and where they differ.',
      },
      {
        q: 'Does CiteLadder show what caused a change?',
        a: 'No. Citations, visits, crawler requests and site changes are stored as separate observations, so you can check each one. When they move together, CiteLadder labels it co-occurrence, not cause.',
      },
      {
        q: 'Will CiteLadder change my website?',
        a: 'No. CiteLadder reads your site and data. The Agent drafts briefs and edits for your team to review, and nothing is published, sent or changed on your behalf.',
      },
      {
        q: 'Can I use CiteLadder from Claude or ChatGPT?',
        a: 'Yes. The CiteLadder MCP server gives compatible assistants access to the workspaces you approve, so you can ask about your visibility, sources and site evidence in plain language. With Allow changes it can also manage prompts, topics, competitors, audits and Actions; it asks before each change, and larger ones run only after you confirm a preview.',
      },
    ],
    closing: 'See what AI says about your brand',
    related: [
      '/platform/ai-visibility',
      '/platform/cited-sources',
      '/platform/ai-referral-analytics',
      '/platform/product-visibility',
      '/platform/site-health',
      '/platform/search-demand',
      '/platform/keyword-research',
      '/platform/content-optimization',
      '/platform/agents',
      '/platform/mcp',
      '/platform/integrations',
    ],
  },
  {
    path: '/platform/ai-visibility',
    updated: '2026-11-18',
    title: 'AI Visibility Tracking & Brand Monitoring | CiteLadder',
    description:
      'Track brand mentions, position, sentiment and competitors across ChatGPT, Gemini, Claude and Google AI Overviews, with every result tied to its recorded answer.',
    heading: 'See how often AI recommends you',
    lead: 'Track how often AI answers recommend you, and how you compare with your competitors.',
    cta: 'trial',
    screen: 'visibility',
    note: TRIAL_NOTE,
    highlights: [
      {
        title: 'Prompts sorted by buyer stage',
        body: 'Group prompts by topic, buyer stage and intent. Branded and unbranded questions are tracked apart.',
      },
      {
        title: 'Competitors side by side',
        body: 'Visibility, average position, share of voice, win rate and sentiment for you and every brand you track, with a page for each competitor.',
      },
      {
        title: 'The answer behind every score',
        body: 'Every trend point opens the recorded answer, its engine and the sources it cited.',
      },
    ],
    features: [
      {
        title: 'Start from the questions your buyers ask',
        body: 'The Prompt builder suggests short buyer questions from your offerings, your topics and the mix you choose, across awareness, consideration and decision. Each suggestion passes a quality check before you see it. If Search Console or keyword research is connected, suggestions follow the way your buyers already search. You can also import a CSV or write your own. Nothing is tracked until you accept it.',
        points: [
          'Suggestions grouped by topic and buyer stage',
          'Unbranded discovery prompts never name you or a competitor',
          'Branded and comparison prompts tracked separately',
          'Accept or reject suggestions in bulk',
        ],
        media: { kind: 'full', screen: 'prompts' },
      },
      {
        title: 'Run the same prompts on every engine',
        body: 'Send one set of prompts to ChatGPT, Gemini, Claude and Google AI Overviews and compare how each treats your brand. Answers vary, so you can repeat each prompt several times in a run. Schedule runs so this month compares cleanly with last month.',
        points: [
          'Consumer answers and model APIs, labeled by surface',
          'Repetitions per prompt to measure consistency',
          'One-off, hourly, daily or weekly schedules',
          'Metrics state how many answers they are based on',
        ],
        media: { kind: 'split', screen: 'engines' },
      },
      {
        title: 'Read the answer behind the trend',
        body: 'Open any result to see whether your brand was mentioned, where it ranked among the brands named and whether your own pages were cited. When an engine exposes the searches it ran, query fan-out lists them. When it does not, the field says unavailable.',
        points: [
          'Mention, position and citation per answer',
          'Engine and collection date on every record',
          'Query fan-out where the engine returns it',
          'Every past answer to a prompt on the prompt’s own page',
          'Missing data shown as missing, never zero',
        ],
        media: { kind: 'split', screen: 'answer' },
      },
      {
        title: 'Know how answers describe you',
        body: 'Perception classifies each answer’s sentiment toward you and your competitors, groups what it says into themes like pricing, quality and support, and keeps the quotes that support each theme. Recommended rate counts the answers that recommend you, shown beside the rate that names you.',
        points: [
          'Net sentiment from −100 to +100, with classified counts',
          'Positive and negative themes with verbatim quotes',
          'Sentiment by theme, topic, engine and prompt',
          'Sources cited beside criticism',
          'Included with visibility tracking, no extra credits',
        ],
        media: { kind: 'split', screen: 'perception' },
      },
      {
        title: 'See who is paying to appear beside your prompts',
        body: 'ChatGPT Search can show sponsored placements next to an answer. CiteLadder records them apart from citations: which advertisers appear, on which prompts, and how often. Ads never count as citations or change your visibility scores.',
        points: [
          'Ad presence across your tracked prompts',
          'Advertisers, appearances and share',
          'Your own ad share, or “Not advertising”',
        ],
        media: { kind: 'card' },
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
        a: 'AI answers vary from one request to the next. Repeating each prompt within a run shows how often you appear across several answers to the same question.',
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
    closing: 'Get your AI visibility baseline',
    // The AI-visibility hub: every page in the cluster links here, and here back to each.
    related: [
      '/llm-rank-tracker',
      '/track-brand-mentions-chatgpt',
      '/compare/profound-alternatives',
      '/open-source',
      '/enterprise',
      '/platform/cited-sources',
      '/ai-search-share-of-voice',
      '/ai-citation-tracking',
      '/platform/site-health',
      '/platform/product-visibility',
      '/blog/ai-search-buyer-prompt-generation',
      '/blog/ai-search-market-share-2026',
      '/blog/google-ai-overviews-statistics-2026',
      '/blog/ads-in-ai-answers',
    ],
  },
  {
    path: '/platform/cited-sources',
    updated: '2026-11-06',
    title: 'AI Citation Tracking Software & Source Analysis | CiteLadder',
    description:
      'See which domains and pages AI answers cite, compare owned and third-party sources, and find cited pages that list competitors but not you.',
    heading: 'Know which pages AI answers cite',
    lead: 'See the websites AI answers rely on, and which of them leave you out.',
    cta: 'demo',
    screen: 'sources',
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
        title: 'Pages that leave you out',
        body: 'Cited pages that list your competitors but not you, with the passage that names them.',
      },
    ],
    features: [
      {
        title: 'From a source pattern to the exact page',
        body: 'Open a domain that keeps appearing to see its cited URLs and the questions behind them. You can tell whether each one is a product page, a guide or an independent comparison, and which engines cite it.',
        points: [
          'Domain and URL views of the same citations',
          'Prompts and engines per source',
          'Source mix across the whole portfolio',
        ],
        media: { kind: 'split', screen: 'cited-url' },
      },
      {
        title: 'Find cited pages that name competitors but not you',
        body: 'After an audit, CiteLadder reads the third-party pages your answers cite, following robots.txt. When a recurring list, comparison, directory or review page names your competitors and skips you, you get an Action with the quoted passage attached. The Agent can turn it into an outreach brief.',
        points: [
          'Brand and competitor presence on each cited page',
          'Quoted passages as evidence',
          'One Action per page worth earning',
          'Outreach drafted by the Agent, never sent for you',
        ],
        media: { kind: 'split', screen: 'prompts' },
      },
      {
        title: 'Mentions and citations are counted apart',
        body: 'An answer can name your product and cite a reviewer’s page. It can cite your docs and recommend someone else. Seeing both tells you whether to fix a page on your site or approach a publisher.',
        points: [
          'Mentions and citations reported separately',
          'Owned citations highlighted per answer',
          'Citation rate measured only where sources were returned',
        ],
        media: { kind: 'split', screen: 'answer' },
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
    closing: 'Find out which sources shape your answers',
    related: [
      '/platform/ai-visibility',
      '/ai-citation-tracking',
      '/platform/site-health',
      '/platform/ai-referral-analytics',
      '/platform/content-optimization',
      '/platform/product-visibility',
      '/blog/action-playbook-winning-ai-citations',
      '/blog/how-accurate-are-ai-citations',
      '/blog/can-chatgpt-find-citations',
    ],
  },
];
