import type { BlogSource } from './blog';

/**
 * The documents the blog cites, defined once and shared by every post.
 *
 * These entries were copied per post, and four of them carried the same
 * OpenAI help-centre URL. When that URL started returning 403 the fix was a
 * four-file sweep, and two posts had already drifted to different titles for
 * the same Search Console page. One definition per document makes a retitle
 * or a moved URL a single edit, and makes it visible when several posts rest
 * on the same evidence.
 *
 * A post still declares which of these it cites: `sources` is the numbered
 * list printed under the article, so it stays per-post and in the author's
 * chosen order. Prefer first-party documentation — the platform describing
 * its own behaviour — over secondary coverage of it.
 */
export const BLOG_SOURCES = {
  gaAiAssistant: {
    id: 'ga-ai-assistant',
    title: 'Default channel group: AI Assistant',
    publisher: 'Google Analytics Help',
    url: 'https://support.google.com/analytics/answer/9756891?hl=en',
  },
  gscAiReport: {
    id: 'gsc-ai-report',
    title: 'Generative AI performance report (Search)',
    publisher: 'Google Search Console Help',
    url: 'https://support.google.com/webmasters/answer/16984139?hl=en',
  },
  bingAiPerformance: {
    id: 'bing-ai-performance',
    title: 'AI Performance in Bing Webmaster Tools',
    publisher: 'Bing Webmaster Tools',
    url: 'https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c',
  },
  bingAiPreview: {
    id: 'bing-ai-preview',
    title: 'Introducing AI Performance in Bing Webmaster Tools',
    publisher: 'Bing Webmaster Blog',
    url: 'https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview',
  },
  bingUrlSubmission: {
    id: 'bing-url-submission',
    title: 'Bing URL Submission API',
    publisher: 'Bing Webmaster Tools',
    url: 'https://www.bing.com/webmasters/url-submission-api',
  },
  openaiCrawlers: {
    id: 'openai-crawlers',
    title: 'OpenAI crawlers',
    publisher: 'OpenAI Platform Docs',
    url: 'https://developers.openai.com/api/docs/bots',
  },
  googleAiModeFanout: {
    id: 'google-ai-mode-fanout',
    title: 'Google Search: Introducing AI Mode in India',
    publisher: 'Google (The Keyword)',
    url: 'https://blog.google/intl/en-in/products/google-search-introducing-ai-mode-in-india/',
  },
  googleStructuredData: {
    id: 'google-structured-data',
    title: 'Understand how structured data works',
    publisher: 'Google Search Central',
    url: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data',
  },
  googlePeopleFirst: {
    id: 'google-people-first',
    title: 'Creating helpful, reliable, people-first content',
    publisher: 'Google Search Central',
    url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',
  },
  googleRecrawl: {
    id: 'google-recrawl',
    title: 'Ask Google to recrawl your URLs',
    publisher: 'Google Search Central',
    url: 'https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl',
  },
  geoPaper: {
    id: 'geo-paper',
    title: 'GEO: Generative Engine Optimization',
    publisher: 'arXiv',
    url: 'https://arxiv.org/abs/2311.09735',
    publishedDate: '2023-11-16',
  },
} as const satisfies Record<string, BlogSource>;
