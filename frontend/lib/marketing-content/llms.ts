import { COMPETITORS } from './compare';
import { POSTS } from './blog';
import { PARENT_COMPANY } from './legal';
import { FOUNDER, PRODUCT_HEAD } from './people';

/**
 * Plain-text facts for answer engines at `/llms.txt`. Keep this aligned with
 * public pages. Do not add unpublished claims, customer results, or causal
 * ranking language.
 */
export const LLMS_TXT = [
  '# CiteLadder',
  '',
  '> CiteLadder is an evidence-grounded AI visibility and AEO platform. It crawls owned pages, connects Search Console and GA4, measures how ChatGPT, Gemini, and Claude mention or cite a brand under a versioned prompt set, and helps teams act on gaps. Metrics open to the persisted answer. Model calls use the customer’s own provider keys. Nothing publishes without an explicit user action.',
  '',
  'CiteLadder is a Cube27 product.',
  `Parent: ${PARENT_COMPANY.legalName} (${PARENT_COMPANY.href})`,
  `Registered office: ${PARENT_COMPANY.address}`,
  `Product: ${PRODUCT_HEAD.name}, ${PRODUCT_HEAD.role} (${PRODUCT_HEAD.linkedin})`,
  `Company: ${FOUNDER.name}, ${FOUNDER.role} (${FOUNDER.linkedin})`,
  `Contact: ${PRODUCT_HEAD.email}`,
  '',
  '## What CiteLadder is',
  '',
  '- AI visibility software for observed mentions, citations, and share under comparable audit conditions.',
  '- Site Health: crawl, page-kind classification, deterministic checks, issues, recrawl verification.',
  '- Content Intelligence: evidence-grounded briefs, drafts, and schema. Save is a human decision.',
  '- Demand Intelligence: Google Search Console and GA4 beside owned-page evidence.',
  '- Growth Agent: typed tools over those systems. No second knowledge store. No autonomous publish.',
  '',
  '## What CiteLadder is not',
  '',
  '- Not a claim that a content change caused rankings, traffic, or revenue.',
  '- Not a hosted-key AI visibility dashboard. Measurement runs on customer BYOK credentials.',
  '- Not an open-source or self-hosted product.',
  '',
  '## Engines measured directly',
  '',
  'ChatGPT, Gemini, and Claude. Other engines named on the marketing site are context, not a promise of a direct audit route.',
  '',
  '## Public pages',
  '',
  '- https://citeladder.com/',
  '- https://citeladder.com/pricing',
  '- https://citeladder.com/enterprise',
  '- https://citeladder.com/solutions',
  '- https://citeladder.com/faq',
  '- https://citeladder.com/blog',
  ...POSTS.map((post) => `- https://citeladder.com/blog/${post.slug}`),
  '- https://citeladder.com/compare',
  ...COMPETITORS.map((competitor) => `- https://citeladder.com/compare/${competitor.slug}`),
  '- https://citeladder.com/docs/mcp',
  '',
  '## Optional reading',
  '',
  'Privacy and terms are Cube27 documents, not a second copy on this domain.',
  PARENT_COMPANY.privacyHref,
  PARENT_COMPANY.termsHref,
  '',
].join('\n');
