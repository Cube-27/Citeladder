import { type PlatformPage } from './platform-page-types';

export const OUTCOME_PAGES: readonly PlatformPage[] = [
  {
    path: '/platform/ai-referral-analytics',
    updated: '2026-11-06',
    title: 'AI Referral Analytics, AI Crawler Logs & ChatGPT Traffic | CiteLadder',
    description:
      'See the visits ChatGPT, Gemini and other AI assistants send to your site from GA4, and the AI crawlers that fetch your pages from your own server logs.',
    heading: 'See the traffic AI sends your way',
    lead: 'See how many visitors AI assistants send to your site and which pages they land on.',
    cta: 'setup',
    screen: 'referrals',
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
        title: 'Find the pages AI visitors land on',
        body: 'Start with sessions per assistant, then open the landing pages behind them and compare engagement. Page figures and property-wide channel totals are shown separately. Data quality notes sit next to the numbers, so you can tell a gap in GA4 from a real fall in traffic.',
        points: [
          'Sessions and engaged sessions per assistant',
          'Landing pages ranked by AI sessions',
          'Key events and revenue as your property reports them',
          'CSV export for your own reporting',
        ],
        media: { kind: 'split', screen: 'cited-url' },
      },
      {
        title: 'See which AI crawlers fetch your pages',
        body: 'On paid plans, send your server logs and CiteLadder picks out requests from known crawlers such as OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot and Googlebot. Each request is checked against the crawler’s published IP ranges. A request with a spoofed user agent shows up as unverified.',
        points: [
          'Cloudflare, Amazon CloudFront, Google Cloud, webhook or file upload',
          'Requests by crawler, purpose and page',
          'Verified, unverifiable and failed checks counted apart',
          'Log coverage shown next to every count',
        ],
        media: { kind: 'split', screen: 'crawler-access' },
      },
      {
        title: 'Put crawls and visits side by side',
        body: 'The Overview lists pages that AI search crawlers fetch but that get no identifiable AI visits, pages with AI visits but no recent crawls, and verified crawler errors on your pages. Each pattern only says the two things happened together. Click it to open the pages behind it.',
        points: [
          'Patterns only when logs and GA4 cover the whole window',
          'Partial coverage flagged on screen',
          'Every pattern opens the page detail',
        ],
        media: { kind: 'card' },
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
        a: 'No. It reports the AI sources your analytics can identify. Visits that arrive without attribution are counted as unknown.',
      },
      {
        q: 'Are key events the same as leads?',
        a: 'Only if your GA4 property counts leads as key events. CiteLadder shows key events exactly as GA4 reports them and does not convert the counts into conversion rates.',
      },
      {
        q: 'How do AI crawler logs reach CiteLadder?',
        a: 'From a Cloudflare Worker, Cloudflare Logpush, an Amazon CloudFront log stream, Google Cloud load balancer and Cloud Run logs through Pub/Sub, a webhook you call, or a file upload. CiteLadder only sees crawlers through the logs you send.',
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
    closing: 'See what AI visitors do on your site',
    related: [
      '/platform/integrations',
      '/platform/cited-sources',
      '/platform/site-health',
      '/platform/search-demand',
      '/blog/ai-referral-traffic-statistics-2026',
    ],
  },
  {
    path: '/platform/product-visibility',
    updated: '2026-11-11',
    title: 'AI Product Visibility & Share of Shelf | CiteLadder',
    description:
      'Track how AI answers recommend your products: visibility, win rate, position, quoted price and merchants per product, including ChatGPT shopping carousels.',
    heading: 'See how your products show up in AI buying answers',
    lead: 'See where your products rank when buyers ask AI what to buy, which price answers quote and where they send shoppers.',
    cta: 'demo',
    screen: 'commerce',
    note: 'Catalog setup depends on your project. Book a demo to check your catalog.',
    highlights: [
      {
        title: 'Every product, every answer',
        body: 'Your catalog is matched in every answer your project collects, and a catalog change re-reads the last 30 days of answers.',
      },
      {
        title: 'ChatGPT shopping carousels',
        body: 'Each organic carousel card becomes a ranked slot, with its price and merchant when the card shows them.',
      },
      {
        title: 'Metrics per product',
        body: 'Visibility, appearances, win rate, position, quoted against catalog price, and the merchants answers name.',
      },
    ],
    features: [
      {
        title: 'Matched in every answer, ChatGPT carousels included',
        body: 'Products are matched in every answer your project collects, including each organic ChatGPT carousel card, with its price and merchant when the card shows them.',
        points: [
          'Cards matched by link, ChatGPT’s product id or name',
          'Sponsored carousel cards kept out of the shelf',
          '30-day re-read after a catalog change',
          'Stored answers never rewritten',
        ],
        media: { kind: 'split', screen: 'answer' },
      },
      {
        title: 'Metrics per product, each with a definition',
        body: 'Visibility, win rate, position and quoted price for each product over 7, 30 or 90 days, beside the competitor products answers name.',
        points: [
          'Appearances, where zero is a real zero',
          'Quotes in other currencies counted, not converted',
          'Merchant domains the answers name',
          'Missing data shown as missing, never as zero',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'Bring your catalog in, then check it',
        body: 'Import from a Shopify storefront URL, a Merchant Center feed or a CSV, and see which rows were added, updated or rejected.',
        points: [
          'Shopify storefront by URL, with no app to install',
          'Merchant Center feed as CSV, TSV, XML or JSON',
          'Products found on your site, for catalog businesses',
          'Edits win over later crawls of the same field',
        ],
        media: { kind: 'card' },
      },
      {
        title: 'From the overview to a product’s Actions',
        body: 'The Shopping overview ranks brands and products. Actions flag products that answers skip, misprice or rarely put first.',
        points: [
          'Brand and product rankings for the window',
          'Competing products and how often each ranked above yours',
          'Every answer opens the recorded evidence',
          'Work with the Agent from any product Action',
        ],
        media: { kind: 'full', screen: 'actions' },
      },
    ],
    steps: [
      {
        title: 'Bring your catalog',
        body: 'Use products found on your site, or import a Shopify storefront, a Merchant Center feed or the CSV template.',
      },
      {
        title: 'Approve prompts and rivals',
        body: 'Generate shopping prompts for each category and for the hero products you pick, then approve them and the competitor products to measure.',
      },
      {
        title: 'Run the shelf',
        body: 'Collect buying answers across engines with repetitions, after reviewing the cost. Your brand runs count too.',
      },
      {
        title: 'Act on products',
        body: 'Open a product’s page and its Actions when it goes unmentioned, is quoted at the wrong price or rarely comes first.',
      },
    ],
    questions: [
      'When buyers ask AI for the best product in our category, are we on the list?',
      'Which competing products take first position most often?',
      'Is ChatGPT quoting the right price for our products?',
      'Which merchants do AI answers send shoppers to for our products?',
      'Which product pages get cited when we are recommended?',
      'Does our category show up for comparison and “alternative to” questions?',
    ],
    faqs: [
      {
        q: 'Who can use Product Visibility?',
        a: 'Any project with a catalog, found on its site or imported. Book a demo to check yours.',
      },
      {
        q: 'What is share of shelf?',
        a: 'Your products’ share of the product slots in answers, counted against the competitors you approved.',
      },
      {
        q: 'Why can win rate be higher than visibility?',
        a: 'Win rate only counts answers that rank the product, so a rarely named product can still come first when it appears.',
      },
      {
        q: 'Does this cover every place AI shows products?',
        a: 'No. It reports the answers from the audits CiteLadder runs. Shopping carousels are captured from ChatGPT; on other engines, products are read from the answer text.',
      },
      {
        q: 'Do I need a Shopify connection?',
        a: 'No. Import a public storefront by URL; there is no app and no automatic sync, so import again when your catalog changes.',
      },
      {
        q: 'Does it read product ratings?',
        a: 'No. The ChatGPT carousel cards we tested carried no ratings.',
      },
      {
        q: 'Does it show how products trend over time?',
        a: 'No. Figures cover the 7, 30 or 90 days you choose.',
      },
      {
        q: 'Does it report sales or revenue from AI answers?',
        a: 'No. Product Visibility measures how products appear in answers. For visits and revenue, use AI Referral Analytics with GA4.',
      },
    ],
    closing: 'See where your products rank in AI answers',
    related: [
      '/blog/track-products-in-chatgpt-shopping',
      '/platform/ai-visibility',
      '/platform/cited-sources',
      '/platform/content-optimization',
      '/solutions#commerce',
      '/blog/agentic-commerce-statistics-2026',
    ],
  },
];
