import type { BlogPost } from '../blog';
import { PRODUCT_HEAD } from '../people';
import { BLOG_SOURCES } from '../blog-sources';

export const POST_AUDIT: BlogPost = {
  slug: 'auditing-content-for-llms-ai-search',
  title: 'How to audit a website for AI search readiness.',
  seoTitle: 'AI Website Readiness Audit and Crawlability Checklist | CiteLadder',
  seoDescription:
    'Check crawl access, indexing controls, public content, factual clarity and internal links. A practical website audit for teams investigating AI search visibility.',
  excerpt:
    'Check the page a visitor or crawler can access before changing the copy. Work through technical and content evidence in a clear order.',
  image: '/blog/editorial/article-audit.png',
  cardImage: '/blog/editorial/article-audit.svg',
  date: '2026-09-03',
  dateModified: '2026-09-09',
  author: PRODUCT_HEAD.name,
  authorRole: PRODUCT_HEAD.role,
  authorUrl: PRODUCT_HEAD.linkedin,
  tags: ['Website readiness'],
  relatedSlugs: ['connecting-owned-evidence-ai-search', 'action-playbook-winning-ai-citations'],
  sources: [
    BLOG_SOURCES.googleRobots,
    BLOG_SOURCES.googleNoindex,
    BLOG_SOURCES.googleJavaScript,
    BLOG_SOURCES.googleStructuredData,
  ],
  editorialNote:
    'Updated to clarify measurement definitions, evidence limits and practical checks.',
  closing: {
    secondary: { href: '/solutions', label: 'Explore team workflows' },
    heading: 'Connect website findings with answer evidence.',
    body: 'Explore how CiteLadder helps your team investigate site readiness alongside AI visibility.',
  },
  body: [
    {
      type: 'paragraph',
      text: 'A website readiness audit should identify observable problems and the next useful test. It should not imply that one score certifies how every AI system will treat the website.',
    },
    {
      type: 'paragraph',
      text: 'Start with the pages that answer important buyer questions: product or service details, pricing, comparisons, implementation information and support documentation. Sample those page types before attempting a site-wide rewrite.',
    },
    { type: 'heading', text: 'Check the public response' },
    {
      type: 'paragraph',
      text: 'Request the exact production URL while signed out. Confirm the status, redirect destination and content returned.',
    },
    {
      type: 'paragraph',
      text: 'Look for login walls, error pages, consent overlays or bot challenges that replace the information. A successful status code with an error message in the body is still a failed experience.',
    },
    {
      type: 'paragraph',
      text: 'Record the affected URL and what was returned. Avoid describing the entire website as inaccessible based on one failed request.',
    },
    { type: 'heading', text: 'Inspect crawl permissions' },
    {
      type: 'paragraph',
      text: 'Review the relevant robots.txt rules for the crawler in question. A rule affecting one user agent is not proof that all crawlers are blocked.',
    },
    {
      type: 'richParagraph',
      content: [
        "Robots.txt controls crawling behavior; it is not a secure way to protect confidential information and is not a dependable substitute for indexing controls. Google's documentation explains these distinctions. ",
        { type: 'link', text: 'Robots.txt guidance', href: BLOG_SOURCES.googleRobots.url },
        '.',
      ],
    },
    {
      type: 'paragraph',
      text: 'Do not open private account, payment or administrative pages to crawlers just to improve an audit score.',
    },
    { type: 'heading', text: 'Separate indexing controls from crawl access' },
    {
      type: 'paragraph',
      text: "Inspect the page's robots meta tag and relevant response headers. A public page can be crawlable while carrying a noindex directive.",
    },
    {
      type: 'richParagraph',
      content: [
        'For Google to discover a noindex rule on a page, it must be able to crawl that page. Blocking it in robots.txt can prevent that inspection. ',
        {
          type: 'link',
          text: "Google's noindex documentation",
          href: BLOG_SOURCES.googleNoindex.url,
        },
        '.',
      ],
    },
    {
      type: 'paragraph',
      text: 'For each important page, record the intended behavior and the observed setting. Do not remove a deliberate exclusion from private or duplicate content without understanding why it exists.',
    },
    { type: 'heading', text: 'Check content delivery' },
    {
      type: 'paragraph',
      text: 'Compare the initial HTML with the rendered page. Can the main explanation, important product details and useful links be found in the delivered content? Does rendering depend on a request that fails when signed out?',
    },
    {
      type: 'richParagraph',
      content: [
        'Google can render JavaScript, but rendering adds another stage and other crawlers may behave differently. Server-rendered or statically delivered critical content can make the public response easier to inspect. Serve consistent content to users and crawlers rather than inventing a separate promotional version for bots. ',
        { type: 'link', text: 'JavaScript SEO guidance', href: BLOG_SOURCES.googleJavaScript.url },
        '.',
      ],
    },
    { type: 'heading', text: 'Review canonical and duplicate-page signals' },
    {
      type: 'paragraph',
      text: "Check that the canonical URL points to the intended public page and is consistent with the site's redirects and internal links. Inspect similar pages for repeated content that could be consolidated.",
    },
    {
      type: 'paragraph',
      text: "A canonical tag does not make a weak page stronger. First decide which page serves the reader's task, then keep the technical signals consistent with that decision.",
    },
    { type: 'heading', text: 'Ask whether the page answers the buyer' },
    {
      type: 'paragraph',
      text: 'Technical access is only one part of readiness. Read the page as a prospective customer.',
    },
    {
      type: 'paragraph',
      text: 'Can you identify what is offered, who it is for, important limitations and the next step? Are key details buried in graphics without equivalent text? Do product and help pages contradict one another?',
    },
    {
      type: 'paragraph',
      text: "For a service business, location and scope may be essential. For a product, compatibility, prerequisites and supported workflows may matter more. Use the audience's decision to choose the checks.",
    },
    { type: 'heading', text: 'Verify claims and structured data' },
    {
      type: 'paragraph',
      text: 'Check numbers, feature promises and comparisons against a maintained source. Remove unsupported superlatives and label illustrative examples.',
    },
    {
      type: 'richParagraph',
      content: [
        'Structured data should represent visible, accurate content and use an appropriate supported type. It is not a guarantee of a rich result or an AI citation. Do not add invented reviews, ratings or prices. ',
        {
          type: 'link',
          text: "Google's structured-data introduction",
          href: BLOG_SOURCES.googleStructuredData.url,
        },
        '.',
      ],
    },
    { type: 'heading', text: 'Inspect the path through the site' },
    {
      type: 'paragraph',
      text: 'An important page should be reachable from relevant navigation or contextual links. Use descriptive anchors and make sure links resolve to the intended canonical destination.',
    },
    {
      type: 'paragraph',
      text: 'A reader moving from an educational guide to a feature explanation and then to pricing should not have to return to the homepage at every step.',
    },
    { type: 'heading', text: 'Prioritize the findings' },
    { type: 'paragraph', text: 'Use a small issue record:' },
    {
      type: 'list',
      items: [
        'Affected URL',
        'Observed problem and supporting evidence',
        'Audience or workflow affected',
        'Proposed correction',
        'Owner',
        'Verification step',
      ],
    },
    {
      type: 'paragraph',
      text: 'Fix confirmed access failures and factual errors before spending time on speculative "AI optimization" tactics. Group repeated template problems so one change can improve several pages.',
    },
    { type: 'heading', text: 'Verify the change' },
    {
      type: 'paragraph',
      text: 'Repeat the original check after release. Confirm that the intended public content is available and that private content remains protected.',
    },
    {
      type: 'paragraph',
      text: 'Then keep website readiness separate from downstream results. A repaired page may become easier to access, but an observed citation or ranking change requires its own measurement.',
    },
    {
      type: 'richParagraph',
      content: [
        'Read the ',
        {
          type: 'link',
          text: 'citation investigation guide',
          href: '/blog/action-playbook-winning-ai-citations',
        },
        ' and the ',
        {
          type: 'link',
          text: 'AI visibility measurement guide',
          href: '/blog/verify-improve-ai-search-visibility',
        },
        ' to connect these checks to a wider workflow.',
      ],
    },
  ],
};
