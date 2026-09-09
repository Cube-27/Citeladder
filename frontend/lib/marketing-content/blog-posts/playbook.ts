import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';

export const POST_PLAYBOOK: BlogPost = {
  slug: 'action-playbook-winning-ai-citations',
  title: 'Operationalizing AEO: The Action Playbook for Winning AI Citations',
  seoTitle: 'How to Get Cited by ChatGPT and AI Search Engines: AEO Playbook',
  seoDescription:
    'Improve content for AI citations with clearer answers, primary evidence, structured facts, and a repeatable evidence-led AEO workflow.',
  excerpt:
    'Turn an evidence-backed content gap into a clear, sourced page improvement—and test the result without promising citations.',
  image: '/blog/editorial/article-playbook.png',
  date: '2026-09-03',
  dateModified: '2026-09-09',
  readTime: '8 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['AEO Playbook', 'AI Citations', 'Content Strategy'],
  relatedSlugs: ['auditing-content-for-llms-ai-search', 'verify-improve-ai-search-visibility'],
  sources: [
    {
      id: 'geo-paper',
      title: 'GEO: Generative Engine Optimization',
      publisher: 'arXiv',
      url: 'https://arxiv.org/abs/2311.09735',
      publishedDate: '2023-11-16',
    },
    {
      id: 'google-people-first',
      title: 'Creating helpful, reliable, people-first content',
      publisher: 'Google Search Central',
      url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',
    },
    {
      id: 'openai-publishers',
      title: 'Publishers and developers FAQ',
      publisher: 'OpenAI Help Center',
      url: 'https://help.openai.com/en/articles/12627856-publishers-and-developers-faq',
    },
  ],
  body: [
    { type: 'heading', text: 'Begin with an evidenced gap' },
    {
      type: 'paragraph',
      text: 'Getting cited is not a switch you can flip. Start with a query or audience need, inspect the current page and available answer observations, and write down the precise gap: missing evidence, ambiguous scope, weak structure, stale facts, or no suitable page at all.',
    },
    { type: 'heading', text: 'Make the page easier to use and quote' },
    {
      type: 'checklist',
      items: [
        {
          title: 'Answer the real question',
          description:
            'Use the language and scope the audience needs, with the conclusion close to the relevant heading.',
        },
        {
          title: 'Support material claims',
          description:
            'Prefer first-party data and primary sources; identify dates, definitions, and limitations.',
        },
        {
          title: 'Create extractable units',
          description:
            'Use descriptive headings, complete sentences, lists, and tables when those structures genuinely clarify the subject.',
        },
        {
          title: 'Connect the evidence',
          description:
            'Add useful internal links to supporting pages and make source links directly followable.',
        },
        {
          title: 'Keep the page human',
          description:
            'Accuracy, usefulness, and a coherent reading experience matter more than copying an alleged model preference.',
        },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Google similarly recommends helpful, reliable, people-first content and clear sourcing rather than content made mainly to manipulate rankings. ',
        { type: 'citation', sourceId: 'google-people-first' },
      ],
    },
    { type: 'heading', text: 'Read GEO benchmarks narrowly' },
    {
      type: 'richParagraph',
      content: [
        'The original GEO paper reported visibility gains of up to 40% for certain optimization methods in its benchmark and metric. That is a study result under defined experimental conditions—not a promise about current production engines, every topic, or your traffic. ',
        { type: 'citation', sourceId: 'geo-paper' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Reddit threads, directories, trade publications, and reference databases can be useful evidence surfaces to audit. They may reveal terminology, questions, comparisons, or independently documented facts. Treat them as research inputs, not as known ranking factors.',
    },
    { type: 'heading', text: 'An illustrative transformation' },
    {
      type: 'table',
      caption: 'Example only—no lift is claimed',
      headers: ['Before', 'After'],
      rows: [
        [
          'Our platform offers best-in-class AI visibility analytics for every team.',
          'Our measurement plan separates four observable signals: attributable referral visits, platform-reported search appearances, reported citation activity, and controlled prompt observations. Each retains its source and observation window.',
        ],
      ],
    },
    {
      type: 'paragraph',
      text: 'The revised version is more specific, defines the categories, and avoids an unprovable superlative. Whether an engine cites it remains an empirical question.',
    },
    { type: 'heading', text: 'Publish deliberately, then measure' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Capture the original page and the evidence behind the change.',
        'Make the smallest coherent edit that addresses the gap.',
        'Record the changed passages and publication time.',
        'Request recrawling only where the relevant search platform supports it.',
        'Repeat the same observation protocol and report variance, failures, and uncertainty.',
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'For ChatGPT search eligibility, confirm that OAI-SearchBot is not blocked; GPTBot controls training and is a separate crawler. Eligibility still does not guarantee inclusion or citation. ',
        { type: 'citation', sourceId: 'openai-publishers' },
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Use the ',
        { type: 'link', text: 'content audit', href: '/blog/auditing-content-for-llms-ai-search' },
        ' to choose a defensible action, the ',
        {
          type: 'link',
          text: 'verification protocol',
          href: '/blog/verify-improve-ai-search-visibility',
        },
        ' to test it, and ',
        { type: 'link', text: 'CiteLadder solutions', href: '/solutions' },
        ' to see how the workflow fits together.',
      ],
    },
  ],
};
