import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';

export const POST_AUDIT: BlogPost = {
  slug: 'auditing-content-for-llms-ai-search',
  title: 'Mapping the Gaps: How to Audit Your Content for Large Language Models',
  seoTitle: 'AEO Content Audit: How to Audit Your Site for AI Search Visibility',
  seoDescription:
    'Run an AEO content audit using extractability, sourcing, structured data, crawler access, Search Console, and Bing citation evidence.',
  excerpt:
    'Audit whether important pages are crawlable, understandable, well sourced, and aligned with real search demand—without inventing universal AI ranking rules.',
  image: '/blog/editorial/article-audit.png',
  date: '2026-09-03',
  dateModified: '2026-09-09',
  readTime: '7 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['Content Audits', 'LLM Retrieval', 'Information Architecture'],
  relatedSlugs: [
    'connecting-owned-evidence-ai-search',
    'action-playbook-winning-ai-citations',
    'verify-improve-ai-search-visibility',
  ],
  sources: [
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
    {
      id: 'google-structured-data',
      title: 'Understand how structured data works',
      publisher: 'Google Search Central',
      url: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data',
    },
    {
      id: 'openai-publishers',
      title: 'Publishers and developers FAQ',
      publisher: 'OpenAI Help Center',
      url: 'https://help.openai.com/en/articles/12627856-publishers-and-developers-faq',
    },
  ],
  body: [
    { type: 'heading', text: 'Define the audit question' },
    {
      type: 'paragraph',
      text: 'A useful AEO audit asks whether a page can be discovered, parsed, understood, supported, and connected to a real audience need. It does not assign a magical authority score or promise a preferred answer length. Different systems, queries, and moments can produce different answers.',
    },
    { type: 'heading', text: 'Audit the site in bounded layers' },
    {
      type: 'checklist',
      title: 'A practical review',
      items: [
        {
          title: 'Access',
          description:
            'Check HTTP status, indexability signals, canonical consistency, and public crawler policy.',
        },
        {
          title: 'Extractability',
          description:
            'Look for descriptive headings, direct prose, useful lists or tables, and facts that retain meaning outside the surrounding page.',
        },
        {
          title: 'Evidence',
          description:
            'Identify claims that need a primary source, first-party data, date, author, or clearer scope.',
        },
        {
          title: 'Structure',
          description:
            'Review title, description, heading hierarchy, internal links, and relevant structured data.',
        },
        {
          title: 'Demand alignment',
          description:
            'Compare the page with real queries and reported search appearances rather than guessed topics.',
        },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Structured data can help machines understand eligible page content, but it must describe visible content accurately and does not guarantee a search appearance. ',
        { type: 'citation', sourceId: 'google-structured-data' },
      ],
    },
    { type: 'heading', text: 'Use platform reports within their limits' },
    {
      type: 'richParagraph',
      content: [
        'Google Search Console reports Google search performance and provides a generative-AI view where available. Aggregation, privacy thresholds, eligibility, and reporting dimensions mean it should be read as platform evidence—not a complete record of every generated answer. ',
        { type: 'citation', sourceId: 'gsc-ai-report' },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Bing Webmaster Tools exposes AI citation activity and related views. That is useful observed evidence, but it does not reveal a universal ranking formula, authority score, or causal explanation. ',
        { type: 'citation', sourceId: 'bing-ai-performance' },
      ],
    },
    { type: 'heading', text: 'What CiteLadder Site Health checks' },
    {
      type: 'paragraph',
      text: 'Site Health evaluates captured pages with deterministic rules for crawl and index signals, titles and descriptions, heading structure, canonical consistency, structured-data validity, internal linking, content availability, and named AI-crawler access policy. A finding describes the observed rule outcome; it is not proof that an answer engine will cite the page.',
    },
    {
      type: 'richParagraph',
      content: [
        'For OpenAI surfaces, review OAI-SearchBot separately from GPTBot because search discovery and model-training controls are distinct. ',
        { type: 'citation', sourceId: 'openai-publishers' },
      ],
    },
    { type: 'heading', text: 'Turn findings into an audit backlog' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Group findings by page template and user intent, not only by URL.',
        'Prioritize blocked access and misleading technical signals before prose polish.',
        'Record the exact evidence and expected observable change for each recommendation.',
        'Make one bounded change where possible, then verify under comparable conditions.',
      ],
    },
    {
      type: 'callout',
      title: 'Avoid false precision',
      text: 'There is no universal paragraph size, answer length, consensus count, or rejection threshold that guarantees retrieval. Prefer clear claims, explicit scope, primary evidence, and pages that remain useful to people.',
    },
    {
      type: 'richParagraph',
      content: [
        'Build the underlying evidence with the ',
        {
          type: 'link',
          text: 'data-stack guide',
          href: '/blog/connecting-owned-evidence-ai-search',
        },
        ', turn findings into improvements with the ',
        {
          type: 'link',
          text: 'AEO action playbook',
          href: '/blog/action-playbook-winning-ai-citations',
        },
        ', and review the product workflow on ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        '.',
      ],
    },
  ],
};
