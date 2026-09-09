import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';

export const POST_VERIFY: BlogPost = {
  slug: 'verify-improve-ai-search-visibility',
  title: 'The Scientific Method of AEO: How to Verify and Improve AI Search Performance',
  seoTitle: 'How to Test AI Visibility Changes: A Repeatable AEO Experiment',
  seoDescription:
    'Use a repeatable AEO experiment protocol to compare AI visibility observations without confusing correlation, crawling, indexing, or causation.',
  excerpt:
    'Use fixed prompts, repeated baselines, documented page changes, controls, raw responses, and explicit uncertainty to test AI visibility work.',
  image: '/blog/editorial/article-verify.png',
  date: '2026-09-03',
  dateModified: '2026-09-09',
  readTime: '7 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['Verification', 'AEO Testing', 'Performance Improvement'],
  relatedSlugs: ['action-playbook-winning-ai-citations', 'tracking-brand-visibility-ai-search'],
  sources: [
    {
      id: 'google-recrawl',
      title: 'Ask Google to recrawl your URLs',
      publisher: 'Google Search Central',
      url: 'https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl',
    },
    {
      id: 'bing-url-submission',
      title: 'Bing URL Submission API',
      publisher: 'Bing Webmaster Tools',
      url: 'https://www.bing.com/webmasters/url-submission-api',
    },
    {
      id: 'openai-publishers',
      title: 'Publishers and developers FAQ',
      publisher: 'OpenAI Help Center',
      url: 'https://help.openai.com/en/articles/12627856-publishers-and-developers-faq',
    },
  ],
  body: [
    { type: 'heading', text: 'Define the observation before the change' },
    {
      type: 'paragraph',
      text: 'AI answers vary. A single before-and-after screenshot cannot establish improvement, and a recrawl request cannot establish causality. Verification begins by specifying what will be observed, under which conditions, and what would count as an unavailable or failed run.',
    },
    { type: 'heading', text: 'A repeatable experiment protocol' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Freeze a prompt portfolio, model or surface, locale, account state where relevant, and collection procedure.',
        'Run a repeated baseline and retain every raw response, including misses and valid zero-mention results.',
        'Document one bounded page change, its source evidence, the exact URL, and the time it went live.',
        'Keep unchanged prompts or pages as controls where practical.',
        'Rerun under the same recorded conditions across enough observations to see variance.',
        'Compare eligible completed observations and report failed or unavailable runs separately.',
        'Label the result as an observation or association unless the design supports a causal claim.',
      ],
    },
    {
      type: 'callout',
      title: 'Preserve raw evidence',
      text: 'A derived mention or citation label should always lead back to the saved response and observation conditions. If the response cannot be inspected, the metric cannot be audited.',
      tone: 'info',
    },
    { type: 'heading', text: 'Recrawling and AI eligibility are different controls' },
    {
      type: 'richParagraph',
      content: [
        'Google supports recrawl requests through URL Inspection for individual pages and sitemaps for larger sets, but requests do not guarantee immediate inclusion. ',
        { type: 'citation', sourceId: 'google-recrawl' },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Bing offers URL submission mechanisms for notifying Bing about changed URLs. That is a Bing discovery workflow, not a command to ChatGPT or another answer engine. ',
        { type: 'citation', sourceId: 'bing-url-submission' },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'For OpenAI, OAI-SearchBot governs search discovery while GPTBot relates to training. Allowing OAI-SearchBot makes a page eligible to appear; it does not create an on-demand recrawl or guarantee a citation. ',
        { type: 'citation', sourceId: 'openai-publishers' },
      ],
    },
    { type: 'heading', text: 'Interpret movement carefully' },
    {
      type: 'table',
      headers: ['Label', 'What it supports'],
      rows: [
        [
          'Observed',
          'A saved response contained—or did not contain—the defined mention or citation.',
        ],
        [
          'Associated',
          'The result changed after the page edit under comparable recorded conditions.',
        ],
        [
          'Causal',
          'Alternative explanations were controlled well enough to attribute the change. This is uncommon in ordinary content work.',
        ],
        [
          'Unavailable',
          'The run could not produce a comparable observation and is excluded from the eligible denominator.',
        ],
      ],
    },
    {
      type: 'paragraph',
      text: 'CiteLadder can organize findings, explicit implementation declarations, and later observations. It does not automatically prove that an external engine recrawled a page or that one edit caused an answer change.',
    },
    {
      type: 'richParagraph',
      content: [
        'Choose a bounded change with the ',
        { type: 'link', text: 'AEO playbook', href: '/blog/action-playbook-winning-ai-citations' },
        ', interpret channels with the ',
        {
          type: 'link',
          text: 'measurement guide',
          href: '/blog/tracking-brand-visibility-ai-search',
        },
        ', or review ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        '.',
      ],
    },
  ],
};
