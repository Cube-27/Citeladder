import { TRIAL_NOTE, type PlatformPage } from './platform-page-types';

export const MEASURE_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/ai-visibility',
    updated: '2026-11-23',
    title: 'AI Visibility Tracking & Brand Monitoring | CiteLadder',
    description:
      'Track brand mentions, position, sentiment and competitors across ChatGPT, Gemini, Claude, Google AI Overviews and Google AI Mode, with every result tied to its recorded answer.',
    heading: 'See how often AI recommends you',
    lead: 'Track how often AI answers recommend you, and how you compare with your competitors.',
    cta: 'trial',
    screen: 'trend',
    note: TRIAL_NOTE,
    highlights: [
      {
        title: 'Prompts sorted by buyer stage',
        body: 'Group prompts by topic, buyer stage and intent.',
      },
      {
        title: 'Competitors side by side',
        body: 'Visibility, position, share of voice, win rate and sentiment for you and every brand you track.',
      },
      {
        title: 'The answer behind every score',
        body: 'Every trend point opens the recorded answer, its engine and the sources it cited.',
      },
    ],
    features: [
      {
        title: 'Start from the questions your buyers ask',
        body: 'The Prompt builder suggests short buyer questions from your offerings and topics. You can also import a CSV or write your own. Nothing is tracked until you accept it.',
        points: [
          'Suggestions grouped by topic and buyer stage',
          'Unbranded discovery prompts never name you or a competitor',
          'Branded and comparison prompts tracked separately',
        ],
        media: { kind: 'full', screen: 'prompts' },
      },
      {
        title: 'Run the same prompts on every engine',
        body: 'Send one set of prompts to ChatGPT, Gemini, Claude, Google AI Overviews and Google AI Mode. Repeat each prompt in a run and schedule runs to compare month to month.',
        points: [
          'Consumer answers and model APIs, labeled by surface',
          'Repetitions per prompt to measure consistency',
          'One-off, hourly, daily or weekly schedules',
        ],
        media: { kind: 'split', screen: 'engines' },
      },
      {
        title: 'Read the answer behind the trend',
        body: 'Open any result to see whether you were mentioned, where you ranked and whether your pages were cited.',
        points: [
          'Mention, position and citation per answer',
          'Query fan-out where the engine returns it',
          'Missing data shown as missing, never zero',
        ],
        media: { kind: 'split', screen: 'answer' },
      },
      {
        title: 'Know how answers describe you',
        body: 'Perception classifies each answer’s sentiment toward you and your competitors and groups what it says into themes like pricing, quality and support, with the quotes behind each theme.',
        points: [
          'Net sentiment from −100 to +100, with classified counts',
          'Positive and negative themes with verbatim quotes',
          'Included with visibility tracking, no extra credits',
        ],
        media: { kind: 'split', screen: 'perception' },
      },
      {
        title: 'See who is paying to appear beside your prompts',
        body: 'CiteLadder records sponsored placements in ChatGPT Search apart from citations: which advertisers appear, on which prompts, and how often.',
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
        body: 'Confirm the brands you want to compare against.',
      },
      {
        title: 'Build the portfolio',
        body: 'Accept suggested prompts or bring your own, organized into topics.',
      },
      {
        title: 'Run on a schedule',
        body: 'Collect answers across your engines, once or on a recurring schedule.',
      },
      {
        title: 'Read and act',
        body: 'Follow trends, open the answers behind them, and send findings to Actions and the Agent.',
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
        a: 'ChatGPT, Gemini, Claude, Google AI Overviews and Google AI Mode, depending on your plan. ChatGPT and Gemini can be tracked from their consumer answers and from their APIs. The free trial is ChatGPT only. Collected answers can differ from what a signed-in user sees.',
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
