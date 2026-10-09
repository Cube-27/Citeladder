import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';
import { BLOG_SOURCES } from '../blog-sources';

export const POST_PLAYBOOK: BlogPost = {
  slug: 'action-playbook-winning-ai-citations',
  title: 'How to turn AI citation findings into useful website improvements.',
  seoTitle: 'How to Investigate and Improve AI Citation Opportunities | CiteLadder',
  seoDescription:
    'Investigate cited sources, check content gaps and choose focused website improvements. A practical AI citation workflow without promises of guaranteed inclusion.',
  excerpt:
    'Read the source, identify the missing answer and choose a defensible next step. A practical workflow for investigating AI citation opportunities.',
  image: '/blog/editorial/article-playbook.png',
  cardImage: '/blog/editorial/article-playbook.svg',
  date: '2026-09-03',
  dateModified: '2026-09-09',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['Citations'],
  relatedSlugs: ['auditing-content-for-llms-ai-search'],
  sources: [BLOG_SOURCES.googleAiFeatures],
  editorialNote:
    'Updated to clarify measurement definitions, evidence limits and practical checks.',
  closing: {
    secondary: { href: '/solutions', label: 'Explore team workflows' },
    heading: 'Investigate the sources behind your visibility.',
    body: 'See how CiteLadder connects recorded answers with cited domains, URLs and website findings.',
  },
  body: [
    {
      type: 'paragraph',
      text: "When an AI answer cites another website, the useful next question is what information that source provides. The citation may point to a comparison, an official product page, a review or material that addresses a narrow part of the buyer's question.",
    },
    {
      type: 'paragraph',
      text: 'A source reference is a starting point for investigation. It does not reveal every reason the engine selected the answer.',
    },
    { type: 'heading', text: 'Capture the answer before drawing conclusions' },
    {
      type: 'paragraph',
      text: 'Keep the original prompt, response, date and collection source. Record the cited URL and the exact claim you want to investigate.',
    },
    { type: 'paragraph', text: 'Separate three situations:' },
    {
      type: 'list',
      items: [
        'Your brand is mentioned and your website is cited.',
        'Your brand is mentioned but another source is cited.',
        'Your brand is absent from the observed answer.',
      ],
    },
    {
      type: 'paragraph',
      text: 'Each situation can lead to different work. None proves that adding more words to your homepage will help.',
    },
    { type: 'heading', text: 'Read the source in context' },
    {
      type: 'paragraph',
      text: "Open the cited page and locate the material relevant to the buyer's question. Look for concrete details such as supported use cases, eligibility, pricing conditions, compatibility, limitations or implementation requirements.",
    },
    {
      type: 'paragraph',
      text: "If the page is a comparison, examine the criteria. If it is a review, distinguish the reviewer's experience from the vendor's factual claims. If it is outdated, note what has changed and find the primary evidence for a correction.",
    },
    {
      type: 'paragraph',
      text: 'Avoid assuming that every website appearing in an answer is a worthwhile backlink target.',
    },
    { type: 'heading', text: 'Choose a gap you can address' },
    {
      type: 'paragraph',
      text: 'A useful content gap is a question that matters to the audience and lacks a clear, supported answer on the appropriate page.',
    },
    {
      type: 'paragraph',
      text: 'For example, a regional maintenance business may explain its services but omit the locations it covers and how emergency availability works. A software product may describe integrations without stating which workflows the integration supports.',
    },
    {
      type: 'paragraph',
      text: 'Improve the page that should answer the question. Do not create a new article for every variation of the same wording.',
    },
    { type: 'heading', text: 'Make the answer easy to verify' },
    {
      type: 'paragraph',
      text: 'State the important fact clearly, explain the conditions and give the reader enough context to use it. Link to supporting documentation when available.',
    },
    {
      type: 'paragraph',
      text: 'If a capability has a limitation, include it. If pricing depends on usage or contract terms, say so. If an example is hypothetical, label it.',
    },
    {
      type: 'paragraph',
      text: 'There is no need to impose a universal paragraph length. Write the shortest answer that is complete for the reader, followed by the detail needed to support it.',
    },
    { type: 'heading', text: 'An illustrative correction' },
    {
      type: 'paragraph',
      text: 'A buyer asks whether a field-service product supports offline work. A cited third-party comparison says that it does not.',
    },
    {
      type: 'paragraph',
      text: 'First verify how the product behaves. If offline functionality exists only for selected actions, document those actions and their limits. Update the relevant product or help page if the explanation is incomplete.',
    },
    {
      type: 'paragraph',
      text: 'Then send the publisher a precise correction through its normal process, with the supporting page. Do not ask it to remove legitimate criticism or claim capabilities the product does not have.',
    },
    {
      type: 'paragraph',
      text: 'If the third-party statement is accurate, the finding may belong in the product roadmap rather than an SEO task.',
    },
    {
      type: 'callout',
      text: 'This example is illustrative and does not describe a CiteLadder customer.',
      tone: 'info',
    },
    { type: 'heading', text: 'Check access before polishing copy' },
    {
      type: 'paragraph',
      text: 'A useful explanation will not help a crawler that cannot access it. Check whether the page is public, returns the intended content and has appropriate crawl and indexing controls.',
    },
    {
      type: 'richParagraph',
      content: [
        'Use the ',
        {
          type: 'link',
          text: 'website readiness checklist',
          href: '/blog/auditing-content-for-llms-ai-search',
        },
        ' to investigate access problems. A successful fetch still does not guarantee indexing or selection as an answer source.',
      ],
    },
    { type: 'heading', text: 'Connect related explanations' },
    {
      type: 'paragraph',
      text: 'Link the improved page from relevant product, help and educational content. Use anchor text that describes the destination, such as "supported offline actions" or "service coverage areas".',
    },
    {
      type: 'paragraph',
      text: 'Internal links should help a reader continue the task. Avoid repeating the same exact-match phrase across unrelated pages to increase link count.',
    },
    { type: 'heading', text: 'Keep a change record' },
    {
      type: 'paragraph',
      text: 'Write down the affected URL, original problem, evidence, published change and date. Use the same relevant prompts for later observations, and keep collection changes visible.',
    },
    {
      type: 'paragraph',
      text: 'Repeated citation patterns can help you choose the next investigation. A single new citation is encouraging evidence, but it does not establish a permanent result or prove causality.',
    },
    {
      type: 'richParagraph',
      content: [
        'Google explains that its AI search features build on existing SEO practices and do not require special AI markup. That guidance applies to Google; other providers have their own systems and controls. ',
        {
          type: 'link',
          text: "Google's guidance on AI features",
          href: BLOG_SOURCES.googleAiFeatures.url,
        },
        '.',
      ],
    },
    { type: 'heading', text: 'Prioritize useful work' },
    {
      type: 'paragraph',
      text: 'Start with changes that improve factual accuracy, explain an important buying question, or remove a verified access problem. These improvements can help human readers even when the AI citation outcome remains uncertain.',
    },
    {
      type: 'richParagraph',
      content: [
        'Use ',
        { type: 'link', text: 'AI citation tracking', href: '/ai-citation-tracking' },
        ' to inspect source patterns and the ',
        {
          type: 'link',
          text: 'measurement guide',
          href: '/blog/verify-improve-ai-search-visibility',
        },
        ' to keep follow-up observations comparable.',
      ],
    },
  ],
};
