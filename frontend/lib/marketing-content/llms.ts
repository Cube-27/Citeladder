import { COMPETITORS } from './compare';
import { POSTS } from './blog';
import { FOOTER_LEGAL_LINKS, PARENT_COMPANY } from './legal';
import { FOUNDER, PRODUCT_HEAD } from './people';
import { CITELADDER_LINKEDIN } from './social';
import { PUBLISHED_PLATFORM } from './nav';

/**
 * Plain-text facts for answer engines at `/llms.txt`. Keep this aligned with
 * public pages. Do not add unpublished claims, customer results, or causal
 * ranking language.
 */
export const LLMS_TXT = [
  '# CiteLadder',
  '',
  '> CiteLadder connects observed AI answers and citations with website findings, first-party search data, optional external research and reviewable Agent workflows. Available engines and capabilities depend on account access and configuration. Nothing publishes automatically.',
  '',
  'CiteLadder is a Cube27 product.',
  `Parent: ${PARENT_COMPANY.legalName} (${PARENT_COMPANY.href})`,
  `Principal business address: ${PARENT_COMPANY.address}`,
  `LinkedIn: ${CITELADDER_LINKEDIN}`,
  `Product: ${PRODUCT_HEAD.name}, ${PRODUCT_HEAD.role} (${PRODUCT_HEAD.linkedin})`,
  `Company: ${FOUNDER.name}, ${FOUNDER.role} (${FOUNDER.linkedin})`,
  `Contact: ${PRODUCT_HEAD.email}`,
  '',
  '## What CiteLadder is',
  '',
  '- AI visibility software for observed mentions, citations, and share under comparable audit conditions.',
  '- Site Health: crawl, page-kind classification, deterministic checks, issues, recrawl verification.',
  '- Content Intelligence: Agent-supported briefs, proposed page edits and internal-link plans for human review.',
  '- Demand Intelligence: Google Search Console and GA4 beside owned-page evidence.',
  '- Agent: chats and reviewable outputs over the same read tools as the MCP server. No second knowledge store. No autonomous publish.',
  '',
  '## What CiteLadder is not',
  '',
  '- Not a claim that a content change caused rankings, traffic, or revenue.',
  '- The public trial is limited AI visibility access for seven days, not access to the whole platform. Agent access is not included.',
  '- General crawler-log ingestion remains unavailable. Commerce requires eligible projects. Optional external research requires scope-and-cost review and separate confirmation.',
  '- Not an open-source or self-hosted product.',
  '',
  '## Engines measured directly',
  '',
  'Engine access follows the supported collection configuration and account setup. The current public trial is ChatGPT-only. Provider/API observations are not identical to every consumer-app experience.',
  '',
  '## Public pages',
  '',
  '- [CiteLadder](https://citeladder.com/)',
  ...PUBLISHED_PLATFORM.map((item) => `- [${item.title}](https://citeladder.com${item.href})`),
  '- [Pricing](https://citeladder.com/pricing)',
  '- [Enterprise](https://citeladder.com/enterprise)',
  '- [Solutions](https://citeladder.com/solutions)',
  '- [FAQ](https://citeladder.com/faq)',
  '- [AI Instructions](https://citeladder.com/ai-instructions)',
  '- [Entity Map](https://citeladder.com/entity-map)',
  '- [Blog](https://citeladder.com/blog)',
  ...POSTS.map((post) => `- [${post.title}](https://citeladder.com/blog/${post.slug})`),
  '- [Compare AI visibility tools](https://citeladder.com/compare)',
  ...COMPETITORS.map(
    (competitor) =>
      `- [CiteLadder vs ${competitor.name}](https://citeladder.com/compare/${competitor.slug})`,
  ),
  '- [Documentation](https://docs.citeladder.com/)',
  '- [MCP](https://docs.citeladder.com/mcp/)',
  '- [Agent](https://docs.citeladder.com/agent/)',
  '',
  '## Policies',
  '',
  `CiteLadder's policies are published here and bind ${PARENT_COMPANY.legalName}.`,
  ...FOOTER_LEGAL_LINKS.map((link) => `- [${link.label}](https://citeladder.com${link.href})`),
  '',
].join('\n');
