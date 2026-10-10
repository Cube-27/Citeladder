import { type PlatformPage } from './platform-page-types';

/** Measurement beyond the answer: AI traffic and the commerce shelf. */
export const OUTCOME_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/ai-referral-analytics',
    title: 'AI Referral Analytics, AI Crawler Logs & ChatGPT Traffic | CiteLadder',
    description:
      'See the visits ChatGPT, Gemini and other AI assistants send to your site from GA4, and the AI crawlers that fetch your pages from your own server logs.',
    heading: 'See the traffic AI sends your way.',
    lead: 'Connect GA4 to see sessions from recognized AI assistants, the pages they land on and what happens next. Add your server logs to see which AI crawlers fetch those pages.',
    cta: 'setup',
    visual: 'referrals',
    visualTitle: 'AI Traffic · Referrals',
    highlights: [
      {
        title: 'Referrals by assistant',
        body: 'Sessions from ChatGPT, Gemini, Claude, Perplexity, Copilot and tagged Google AI Overview links.',
      },
      {
        title: 'Crawlers by purpose',
        body: 'Verified requests from AI search, training and user-triggered crawlers, from your own logs.',
      },
      {
        title: 'Outcomes as reported',
        body: "Engaged sessions, key events and purchase revenue in your property's own currency.",
      },
    ],
    features: [
      {
        title: 'Find the pages AI visitors land on.',
        body: 'Move from source totals to landing pages and compare engagement. Page-level scope stays distinct from property-wide channel totals, and data quality notes sit beside the numbers so a gap in GA4 never reads as a drop in traffic.',
        points: [
          'Sessions and engaged sessions per assistant',
          'Landing pages ranked by AI sessions',
          'Key events and revenue as your property reports them',
          'CSV export for your own reporting',
        ],
        visual: 'page-report',
      },
      {
        title: 'See which AI crawlers fetch your pages.',
        body: 'On paid plans, send your server logs and CiteLadder identifies requests from known crawlers such as OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot and Googlebot. Requests are checked against published IP ranges, so a spoofed user agent is reported as unverified rather than counted as the real bot.',
        points: [
          'Cloudflare, Amazon CloudFront, Google Cloud, webhook or file upload',
          'Requests by crawler, purpose and page',
          'Verified, unverifiable and failed checks counted apart',
          'Log coverage shown, so a gap is not read as no crawls',
        ],
        visual: 'crawlers',
      },
      {
        title: 'Put crawls and visits side by side.',
        body: 'The Overview highlights pages that AI search crawlers fetch but that receive no identifiable AI visits, pages with AI visits but no recent crawls, and verified errors on pages that matter. Each pattern is described as co-occurrence, with links to the pages behind it.',
        points: [
          'Patterns only when logs and GA4 cover the whole window',
          'Partial coverage flagged on screen',
          'Every pattern opens the page detail',
        ],
        visual: 'referrals',
      },
    ],
    steps: [
      {
        title: 'Connect GA4',
        body: 'Sign in with Google and map the property that measures your site.',
      },
      {
        title: 'Add server logs',
        body: 'On paid plans, connect Cloudflare, CloudFront or Google Cloud, post logs to a webhook, or upload a file.',
      },
      {
        title: 'Review traffic',
        body: 'See AI referrals and crawler requests by source, purpose and landing page.',
      },
      {
        title: 'Investigate pages',
        body: 'Open any page to compare crawls, visits, outcomes and its AI visibility evidence.',
      },
    ],
    questions: [
      'How many sessions did ChatGPT send us last month, and to which pages?',
      'Do visitors from AI assistants engage or convert differently?',
      'Is OAI-SearchBot crawling our product pages?',
      'Which pages do AI crawlers fetch that never receive AI visits?',
      'Are AI crawlers hitting errors on pages we care about?',
    ],
    faqs: [
      {
        q: 'Which AI assistants are recognized as referrers?',
        a: 'ChatGPT, Gemini, Claude, Perplexity and Microsoft Copilot from referral data, and Google AI Overviews when the link carries a recognizable campaign tag.',
      },
      {
        q: 'Can this find all traffic influenced by AI?',
        a: 'No. It reports sources your analytics can identify. Visits with missing attribution stay unknown rather than being relabeled.',
      },
      {
        q: 'Are key events the same as leads?',
        a: 'They follow your GA4 configuration. CiteLadder reports them as configured and does not turn event counts into conversion rates.',
      },
      {
        q: 'How do AI crawler logs reach CiteLadder?',
        a: 'From a Cloudflare Worker, Cloudflare Logpush, an Amazon CloudFront log stream, Google Cloud load balancer and Cloud Run logs through Pub/Sub, a webhook you call, or a file upload. CiteLadder does not observe crawlers on its own; it needs your site’s logs.',
      },
      {
        q: 'Are crawler logs in the free trial?',
        a: 'No. AI crawler logs are available on paid plans. The trial covers AI visibility on ChatGPT.',
      },
      {
        q: 'Which crawlers are identified?',
        a: 'Known search and AI crawlers including Googlebot, Bingbot, OAI-SearchBot, GPTBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot and Applebot-Extended.',
      },
      {
        q: 'What happens to visitor IP addresses in the logs?',
        a: 'IP addresses are used only while verifying a crawler against published ranges and are never stored, nor are full user agents, cookies or request bodies. Raw log rows are kept for a limited period.',
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
      'Measure how your products and categories appear in AI buying answers, including share of shelf and first-position wins where answers rank products.',
    heading: 'See how your products show up in AI buying answers.',
    lead: 'Track a product or category across buyer prompts, compare it with competing products, and see where answers rank it. Catalogs come from your site or a CSV import.',
    cta: 'demo',
    visual: 'commerce',
    visualTitle: 'AI Shelf',
    note: 'Catalog setup depends on your project. Book a demo to check your catalog.',
    highlights: [
      {
        title: 'Products and categories',
        body: 'Measure a specific product or a whole category against the competitors you approve.',
      },
      {
        title: 'Share of shelf',
        body: 'Your share of the product slots in answers that rank products explicitly.',
      },
      {
        title: 'What was recommended',
        body: 'Product identity, brand and cited URL, kept apart for every answer.',
      },
    ],
    features: [
      {
        title: 'Review prompts and rivals before you measure.',
        body: 'Approve the buyer prompts and competitor products for each target, check engines and repetitions, then run. Each run keeps its catalog and competitor context, so later runs compare like with like.',
        points: [
          'Target-specific buyer prompts',
          'Competitor candidates you approve',
          'Cost estimate before launch',
          'Catalog from your site or a CSV file',
        ],
        visual: 'shelf-setup',
      },
      {
        title: 'Shelf metrics that only count real rankings.',
        body: 'Product Visibility shows how often a product appears. Share of Shelf, Average Shelf Position and First-Position Win Rate count only answers that present products as an ordered list, so a passing mention is never scored as a ranking.',
        points: [
          'Product Visibility per target',
          'Share of Shelf: your slots out of all recognized slots',
          'Average Shelf Position and First-Position Win Rate',
          'Shelf evidence and Actions per product or category',
        ],
        visual: 'commerce',
      },
    ],
    steps: [
      {
        title: 'Bring your catalog',
        body: 'Use products found on your site, or import a CSV of products and categories.',
      },
      {
        title: 'Pick targets',
        body: 'Choose the products or categories that matter and approve their prompts and rivals.',
      },
      {
        title: 'Run the shelf',
        body: 'Collect buying answers across engines with repetitions, after reviewing the cost.',
      },
      {
        title: 'Improve the page',
        body: 'Open shelf evidence and Actions for the products that lose position.',
      },
    ],
    questions: [
      'When buyers ask AI for the best product in our category, are we on the list?',
      'Which competing products take first position most often?',
      'Which product pages get cited when we are recommended?',
      'Does our category show up for comparison and “alternative to” questions?',
    ],
    faqs: [
      {
        q: 'Who can use Commerce Intelligence?',
        a: 'Projects that sell from a catalog can use products found on their site. Any project can import products and categories from a CSV file. Book a demo to check your catalog.',
      },
      {
        q: 'What is share of shelf?',
        a: 'Your share of the product slots in answers that rank products explicitly. Answers that only mention products in passing do not count toward shelf position.',
      },
      {
        q: 'Does this cover every place AI shows products?',
        a: "No. It reports product and category answers under CiteLadder's supported audits, not every shopping carousel in every assistant.",
      },
      {
        q: 'Do I need a Shopify connection?',
        a: 'No. Catalog targets come from your website and CSV workflows. A native Shopify sync is not offered.',
      },
      {
        q: 'Does it report sales or revenue from AI answers?',
        a: 'No. Commerce Intelligence measures how products appear in answers. For visits and revenue, use AI Referral Analytics with GA4.',
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
