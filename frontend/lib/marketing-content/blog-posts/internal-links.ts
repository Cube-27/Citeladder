import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';
import { BLOG_SOURCES } from '../blog-sources';

export const POST_INTERNAL_LINKS: BlogPost = {
  slug: 'jev-internal-linking-citeladder',
  title: 'Internal linking with Jev: how CiteLadder finds contextual link opportunities',
  seoTitle: 'Internal Link Suggestions: How CiteLadder Uses Jev to Find Contextual Links',
  seoDescription:
    "How CiteLadder combines deterministic page retrieval with TypeSafe's Jev to suggest contextual internal links, with anchor text taken from the destination page itself.",
  excerpt:
    'Internal linking is a decision problem before it is a writing problem: which related page would help this reader next?',
  image: '/blog/editorial/article-internal-links.png',
  cardImage: '/blog/editorial/article-internal-links.svg',
  date: '2026-09-28',
  readTime: '7 min read',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['Internal Linking', 'Site Health', 'Information Architecture'],
  relatedSlugs: ['auditing-content-for-llms-ai-search', 'action-playbook-winning-ai-citations'],
  sources: [BLOG_SOURCES.googleLinkBestPractices, BLOG_SOURCES.typesafeSystemOne],
  body: [
    {
      type: 'paragraph',
      text: 'Internal-link recommendations look simple until a site has hundreds of product, category, service and editorial pages. A useful system has to tell a helpful link from two pages that only share vocabulary. That is why CiteLadder treats internal linking as retrieval followed by a bounded judgment, rather than asking a generative model to invent links across the site.',
    },
    { type: 'heading', text: 'Why internal linking is a decision problem' },
    {
      type: 'richParagraph',
      content: [
        'Google recommends linking important pages from other relevant pages, with concise, descriptive anchor text that helps people and search engines understand the destination. ',
        { type: 'citation', sourceId: 'google-link-best-practices' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Producing an HTML anchor is the easy part. The hard part is deciding which page pairs are related enough to deserve one. A naive system can create thousands of technically valid but editorially useless links: product variants linking to each other, utility pages receiving links, or pages connected only because they repeat the same brand words.',
    },
    {
      type: 'callout',
      title: 'The design rule',
      text: 'Code handles what the application can know exactly. Jev answers only the semantic question that remains. A person still decides what gets implemented.',
      tone: 'accent',
    },
    { type: 'heading', text: 'Step 1: shortlist related pages without AI' },
    {
      type: 'paragraph',
      text: 'An analysis starts from a completed Site Health crawl. For each captured page, CiteLadder builds a lightweight representation from its title, main heading, URL path and meta description, and ranks related destinations by text similarity. Words that appear across a large share of the site, such as the brand name or template text, carry no weight.',
    },
    {
      type: 'checklist',
      title: 'Before Jev sees a pair, CiteLadder removes obvious bad candidates',
      items: [
        {
          title: 'Existing contextual links',
          description:
            'If the crawl already found a main-content link from the source to the destination, the pair is not proposed again. A navigation-only link does not count.',
        },
        {
          title: 'Self-links and utility pages',
          description:
            'A page never suggests itself, and policy, about and contact pages neither give nor receive suggestions.',
        },
        {
          title: 'Ineligible destinations',
          description: 'A destination must be an indexable captured page.',
        },
        {
          title: 'Product variants',
          description:
            'Products whose titles differ only by a colour or size word never suggest each other, so the shortlist is not flooded with near-identical items.',
        },
        {
          title: 'Tracking parameters',
          description:
            'Click-tracking parameters are removed from page identity, so one destination is never treated as several pages.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'This stage is deterministic, so it is cheap, repeatable and explainable. It stops Jev from spending judgments on pairs the application can reject on its own.',
    },
    { type: 'heading', text: 'Step 2: let Jev judge each page pair' },
    {
      type: 'paragraph',
      text: 'For each shortlisted pair, CiteLadder sends Jev a bounded description of both pages: title, main heading, path, page type, description and a short excerpt, plus how many contextual links the destination already receives. Jev answers one question: should the source contain a contextual link to the destination?',
    },
    {
      type: 'richParagraph',
      content: [
        'Jev returns a typed answer with a probability instead of prose the application must parse. ',
        { type: 'citation', sourceId: 'typesafe-system-one' },
        ' CiteLadder treats that probability as a review signal, not proof that a link will improve rankings.',
      ],
    },
    {
      type: 'paragraph',
      text: 'The rubric is deliberately narrow: would a reader of the source benefit from the destination, and does the link fit a hub-and-spoke structure, with supporting pages linking up to their hub and hubs linking down, rather than a forced association?',
    },
    { type: 'heading', text: 'Step 3: keep anchor text grounded in the destination' },
    {
      type: 'paragraph',
      text: 'CiteLadder never asks a model to invent anchor text. Options come from the destination page itself: its main heading, its title without the site suffix, and a readable URL slug. When there is more than one option, Jev chooses among them.',
    },
    {
      type: 'paragraph',
      text: 'That boundary matters. The model picks from controlled options; the application owns the text and can show where each option came from. An anchor cannot drift from the page a reader will reach.',
    },
    { type: 'heading', text: 'Step 4: review the suggestion, not a black-box score' },
    {
      type: 'paragraph',
      text: 'The Internal links tab in Website keeps the source, destination and suggested anchor together, with copyable HTML. Suggestions can be filtered, reviewed and exported as CSV, and appear as they are checked rather than only at the end. You remain the editor. CiteLadder finds opportunities but does not publish links into your CMS.',
    },
    {
      type: 'paragraph',
      text: 'A probability threshold is an operating policy, not a universal SEO rule. The right value depends on the crawl, the kind of site, the model version and the cost of a false positive, which is why every suggestion stays reviewable.',
    },
    { type: 'heading', text: 'Step 5: verify the change on a later crawl' },
    {
      type: 'paragraph',
      text: "Suggestions join the source page's Action. When you mark the links you added as implemented, a later crawl checks whether a main-content link to each destination is present, even if you reworded the anchor. That check needs no model call.",
    },
    {
      type: 'diagram',
      title: 'The internal-link workflow',
      variant: 'flow',
      data: {
        steps: [
          {
            step: '01',
            title: 'Retrieve',
            desc: 'Shortlist related, currently unlinked destinations from the crawl.',
          },
          {
            step: '02',
            title: 'Judge',
            desc: 'Ask Jev whether the source should link to the destination.',
          },
          {
            step: '03',
            title: 'Review',
            desc: 'Inspect the destination and anchor taken from its own page.',
          },
          { step: '04', title: 'Implement', desc: 'Add the links you choose to your site.' },
          {
            step: '05',
            title: 'Verify',
            desc: 'A later crawl confirms the link exists in main content.',
          },
        ],
      },
    },
    { type: 'heading', text: 'What CiteLadder deliberately does not do' },
    {
      type: 'list',
      items: [
        'Claim that an internal link guarantees a ranking or AI-citation improvement.',
        'Generate links from raw similarity alone.',
        'Invent anchor text or publish links automatically.',
        'Treat a Jev probability as an SEO authority score.',
        'Replace editorial judgment about navigation, merchandising or content strategy.',
      ],
    },
    {
      type: 'richParagraph',
      content: [
        'Internal links are one part of a broader evidence workflow. Use the ',
        {
          type: 'link',
          text: 'content audit',
          href: '/blog/auditing-content-for-llms-ai-search',
        },
        ' to find structural issues, the ',
        {
          type: 'link',
          text: 'AEO action playbook',
          href: '/blog/action-playbook-winning-ai-citations',
        },
        ' to plan improvements, and the ',
        {
          type: 'link',
          text: 'verification protocol',
          href: '/blog/verify-improve-ai-search-visibility',
        },
        ' to check what changed. ',
        { type: 'link', text: 'Content Intelligence', href: '/platform/content-intelligence' },
        ' explains the Agent-supported internal-link planning workflow. Agent access is not included in the current public trial.',
      ],
    },
  ],
};
