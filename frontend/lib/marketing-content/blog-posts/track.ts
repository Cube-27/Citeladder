import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';

export const POST_TRACK: BlogPost = {
  slug: 'tracking-brand-visibility-ai-search',
  title: 'The Attribution Crisis: How to Track and Measure True AI Search Share',
  seoTitle: 'How to Track AI Search Traffic & Visibility in GA4, GSC and Bing',
  seoDescription:
    'Measure AI referral traffic, Google AI impressions, Bing citation activity, and controlled prompt visibility without overstating attribution.',
  excerpt:
    'Track four distinct evidence streams—referral visits, Google AI impressions, Bing citation activity, and controlled prompt observations.',
  image: '/blog/editorial/article-track.png',
  date: '2026-09-03',
  dateModified: '2026-09-09',
  readTime: '9 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['Attribution', 'AI Visibility', 'Share of Voice'],
  relatedSlugs: ['connecting-owned-evidence-ai-search', 'verify-improve-ai-search-visibility'],
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
      id: 'bing-ai-performance',
      title: 'AI Performance in Bing Webmaster Tools',
      publisher: 'Bing Webmaster Tools',
      url: 'https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c',
    },
  ],
  body: [
    { type: 'heading', text: 'Use a four-part measurement taxonomy' },
    {
      type: 'paragraph',
      text: 'AI visibility is not one channel or one metric. A visit, a Google search appearance, a Bing citation, and a controlled model response are different observations. Keep them separate so a gain in one is not misreported as a gain in all.',
    },
    {
      type: 'table',
      headers: ['Evidence stream', 'What it measures', 'What it does not prove'],
      rows: [
        [
          'GA4 referral clicks',
          'Visits that reached the site and were attributed to an AI-assistant source or channel.',
          'How often an answer mentioned the brand without a click.',
        ],
        [
          'Google AI impressions',
          'Eligible Google search appearances reported within Search Console.',
          'Visibility across every answer engine.',
        ],
        [
          'Bing citation activity',
          'Citations and related AI performance views reported by Bing.',
          'A universal citation ranking mechanism.',
        ],
        [
          'Controlled prompt visibility',
          'Mentions and citations observed across a fixed prompt portfolio and recorded conditions.',
          'Population-wide user behavior or causal lift.',
        ],
      ],
    },
    { type: 'heading', text: 'Start with native platform reporting' },
    {
      type: 'richParagraph',
      content: [
        'GA4 added an AI Assistant default channel, making it the primary starting point for attributable AI referral traffic. Custom source rules can remain a documented fallback for edge cases, but a stale regex should not replace the native classification. ',
        { type: 'citation', sourceId: 'ga-ai-assistant' },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Search Console provides a generative-AI performance view for Google search. Read it with its documented dimensions, eligibility, aggregation, and privacy limitations. ',
        { type: 'citation', sourceId: 'gsc-ai-report' },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Bing AI Performance reports citation activity and related insights from Bing. Use those figures as Bing-reported evidence, not as a hidden authority score or a causal account of why a citation occurred. ',
        { type: 'citation', sourceId: 'bing-ai-performance' },
      ],
    },
    { type: 'heading', text: 'Make controlled visibility metrics auditable' },
    {
      type: 'paragraph',
      text: 'For a fixed prompt set, the denominator should be eligible completed observations. A valid response with no mention is a zero. Failed and unavailable runs are reported separately rather than silently counted as misses or discarded.',
    },
    {
      type: 'paragraph',
      text: 'Mention share is based on observed mentions within those completed observations. If competitors are included, define the comparison set before collection and retain the raw responses behind every count. The metric describes the sampled portfolio and conditions—not all possible prompts or users.',
    },
    { type: 'heading', text: 'Build a reporting cadence' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Freeze definitions, property scope, prompt portfolio, and comparison windows.',
        'Report each evidence stream separately before creating an executive summary.',
        'Show denominators, coverage, failures, and unavailable data next to rates.',
        'Annotate content releases and technical changes without assuming causation.',
        'Use repeated comparable observations to describe direction and variance.',
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Connect the source evidence with the ',
        {
          type: 'link',
          text: 'AEO data-stack guide',
          href: '/blog/connecting-owned-evidence-ai-search',
        },
        ', test changes with the ',
        {
          type: 'link',
          text: 'verification protocol',
          href: '/blog/verify-improve-ai-search-visibility',
        },
        ', and explore ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        '.',
      ],
    },
  ],
};
