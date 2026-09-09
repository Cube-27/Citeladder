import type { BlogPost } from '../blog';
import { FOUNDER } from '../people';

export const POST_CONNECT: BlogPost = {
  slug: 'connecting-owned-evidence-ai-search',
  title: 'Connecting the Dots: Building an Owned Evidence System for AI Search',
  seoTitle: 'How to Build an AI Search Visibility Data Stack for AEO',
  seoDescription:
    'Build an evidence-led AEO data stack across your website, Search Console, GA4, crawler access, and controlled AI visibility observations.',
  excerpt:
    'Connect crawl evidence, search demand, referral traffic, crawler policy, and controlled answer observations without pretending they measure the same thing.',
  image: '/blog/editorial/article-connect.png',
  date: '2026-09-03',
  dateModified: '2026-09-09',
  readTime: '6 min read',
  author: FOUNDER.name,
  authorRole: FOUNDER.role,
  authorUrl: FOUNDER.linkedin,
  tags: ['AEO Foundations', 'Evidence Systems', 'Data Integration'],
  relatedSlugs: ['auditing-content-for-llms-ai-search', 'tracking-brand-visibility-ai-search'],
  sources: [
    {
      id: 'ga-ai-assistant',
      title: 'Analytics release notes: AI Assistant channel',
      publisher: 'Google Analytics Help',
      url: 'https://support.google.com/analytics/answer/9164320?hl=en',
    },
    {
      id: 'gsc-ai-report',
      title: 'Generative AI in Search Console performance reporting',
      publisher: 'Google Search Console Help',
      url: 'https://support.google.com/webmasters/answer/16984139?hl=en',
    },
    {
      id: 'openai-publishers',
      title: 'Publishers and developers FAQ',
      publisher: 'OpenAI Help Center',
      url: 'https://help.openai.com/en/articles/12627856-publishers-and-developers-faq',
    },
  ],
  body: [
    { type: 'heading', text: 'Start with evidence boundaries' },
    {
      type: 'paragraph',
      text: 'An AEO data stack is useful only when every signal keeps its meaning. A crawl describes what your site exposed at a moment in time. Search Console describes Google search performance. Analytics describes visits that reached your site. Controlled answer observations describe what a chosen model returned under recorded conditions.',
    },
    {
      type: 'callout',
      title: 'Observed is not inferred',
      text: 'Observed evidence is captured directly: a page response, a referral click, a reported impression, or a saved answer. Inferred evidence is an interpretation, such as why a page was cited or whether a change caused a result. Store and label both, but never merge them.',
      tone: 'info',
    },
    { type: 'heading', text: 'The five evidence layers' },
    {
      type: 'checklist',
      items: [
        {
          title: 'Owned-site crawl evidence',
          description:
            'URLs, status codes, canonical signals, headings, structured data, internal links, and extractable page text captured during an explicit crawl.',
        },
        {
          title: 'Search demand',
          description:
            'Queries, pages, clicks, impressions, and positions reported by Search Console, with the dimensions and date range retained.',
        },
        {
          title: 'Referral traffic',
          description:
            'Sessions and engagement from attributable sources in GA4, including the native AI Assistant channel when available.',
        },
        {
          title: 'Crawler access policy',
          description:
            'The robots.txt rules and page directives that govern whether named crawlers are allowed to fetch content.',
        },
        {
          title: 'Controlled answer observations',
          description:
            'Saved prompts, model and locale conditions, raw responses, observed mentions, and observed citations.',
        },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Google now provides a native AI Assistant default channel in Analytics, so use that classification before maintaining a custom regex as the primary workflow. ',
        { type: 'citation', sourceId: 'ga-ai-assistant' },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Search Console can report Google generative-AI search appearances, but the report remains a Google-owned view with its own eligibility, dimensions, and aggregation. It is not a universal AI citation ledger. ',
        { type: 'citation', sourceId: 'gsc-ai-report' },
      ],
    },
    { type: 'heading', text: 'Crawler policy is configuration, not proof of a visit' },
    {
      type: 'richParagraph',
      content: [
        'OpenAI distinguishes OAI-SearchBot, which supports search discovery, from GPTBot, which is used for training controls. A robots rule can allow or disallow access, but it does not prove that a crawler visited a page. CiteLadder evaluates public crawler policy; it does not ingest or monitor server or CDN logs. ',
        { type: 'citation', sourceId: 'openai-publishers' },
      ],
    },
    { type: 'heading', text: 'Join evidence without flattening it' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Normalize URLs while retaining the exact source URL and capture time.',
        'Keep provider rows append-only and attach the provider, dimensions, and observation window.',
        'Separate unavailable and failed observations from valid zero values.',
        'Compare like-for-like windows and prompt conditions before describing movement.',
        'Link every recommendation back to the crawl, report row, or answer observation that supports it.',
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Once the foundation is connected, use the ',
        {
          type: 'link',
          text: 'content audit guide',
          href: '/blog/auditing-content-for-llms-ai-search',
        },
        ' to find page-level gaps, the ',
        { type: 'link', text: 'tracking guide', href: '/blog/tracking-brand-visibility-ai-search' },
        ' to keep channel metrics distinct, or explore ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        '.',
      ],
    },
  ],
};
