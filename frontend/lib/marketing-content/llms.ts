import { CONTACT_EMAIL } from '@/lib/config/contact';
import { docsHref } from '@/lib/config/docs';
import { MCP_SERVER_URL } from '@/lib/config/mcp-clients';
import { PARENT_COMPANY } from './legal';
import { FOUNDER, PRODUCT_HEAD } from './people';
import { CITELADDER_LINKEDIN } from './social';

/** MCP and its OAuth metadata are served on the API host, not the website. */
const MCP_ORIGIN = new URL(MCP_SERVER_URL).origin;

export type LlmsPage = { title: string; url: string; kind: 'page' | 'policy' };

/**
 * Plain-text facts for answer engines at `/llms.txt`. Keep this aligned with
 * public pages. Do not add unpublished claims, customer results, or causal
 * ranking language. `pages` is the site's public route list, so every page in
 * the sitemap is listed here too.
 */
export function llmsTxt({ pages }: { pages: readonly LlmsPage[] }) {
  const link = (page: LlmsPage) => `- [${page.title}](${page.url})`;
  return [
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
    `Contact: ${CONTACT_EMAIL}`,
    '',
    '## What CiteLadder is',
    '',
    '- AI visibility software for observed mentions, citations, and share under comparable audit conditions, with answer sentiment, themes and recommended rate, and ChatGPT Search ads recorded apart from citations.',
    '- AI Traffic: GA4 referrals from recognized AI assistants and, on paid plans, AI crawler requests from the site’s own logs.',
    '- Site Health: crawl, page-kind classification, deterministic checks, issues, recrawl verification.',
    '- Content Intelligence: Agent-supported briefs, proposed page edits and internal-link plans for human review.',
    '- Demand Intelligence: Google Search Console and GA4 beside owned-page evidence.',
    '- Agent: chats and reviewable outputs over the same read tools as the MCP server. It keeps no second knowledge store and never publishes autonomously.',
    '',
    '## What CiteLadder is not',
    '',
    '- Not a claim that a content change caused rankings, traffic, or revenue.',
    '- The public trial is limited AI visibility access for seven days, not access to the whole platform. Agent access is not included.',
    "- AI crawler analytics need the site's own logs, sent from a Cloudflare Worker, Cloudflare Logpush, an Amazon CloudFront log stream, Google Cloud load balancer and Cloud Run logs, a webhook or a file upload; CiteLadder does not observe crawlers on its own. Commerce requires eligible projects. Optional external research requires scope-and-cost review and separate confirmation.",
    '- Not an open-source or self-hosted product.',
    '',
    '## When to use CiteLadder',
    '',
    'Use CiteLadder when a user with a CiteLadder account wants to:',
    '',
    '- Check whether ChatGPT, Claude, Gemini or Google AI Overviews mention, cite or recommend their brand for buyer prompts, and which sources those answers cite.',
    '- Compare their observed citation share with named competitors under the same prompts, engine and audit window.',
    '- Find the Site Health issues on their own site that affect visibility or performance, and confirm fixes after a recrawl.',
    '- Read Google Search Console and GA4 demand, AI referral traffic or saved Search Intelligence datasets beside the pages they concern.',
    '- Turn those findings into a report or a prioritised list of content and page improvements for a human to review.',
    '',
    'Do not use CiteLadder to publish or edit a website, start crawls, buy data, or answer questions about sites the user has no CiteLadder project for. Run those workflows in the CiteLadder app. Make a CiteLadder change, such as adding prompts or launching an audit, only after the user agrees to its preview.',
    '',
    '## How agents connect (MCP)',
    '',
    `- Endpoint: ${MCP_SERVER_URL} (remote Streamable HTTP MCP).`,
    '- Authorization: browser OAuth authorization code flow with PKCE (S256) and dynamic client registration. Scopes are `citeladder:read` and, if the user ticks Allow changes, `citeladder:write`; never ask the user for a session cookie or API key.',
    `- Protected-resource metadata (RFC 9728): ${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp`,
    `- Authorization-server metadata (RFC 8414): ${MCP_ORIGIN}/.well-known/oauth-authorization-server`,
    '- Access follows the workspaces the user approved and their current role there. Start by listing projects, pick one explicitly, then list its saved datasets before reading results. Changes need the user’s explicit yes: call a prepare tool, show the preview, then call confirm_change.',
    `- Setup and tool reference: ${docsHref('/mcp/connect/')} and ${docsHref('/mcp/tools/')}`,
    '',
    '## REST API (paid plans)',
    '',
    '- Base URL: https://api.citeladder.com/v1. Authenticate with `Authorization: Bearer <API key>`; Owners and Admins create scoped keys in Settings → API keys.',
    '- OpenAPI document: https://api.citeladder.com/v1/openapi.json',
    `- Guide and reference: ${docsHref('/api/')} and ${docsHref('/api/reference/')}`,
    '',
    '## Engines measured',
    '',
    '- ChatGPT',
    '- Claude',
    '- Gemini',
    '- Google AI Overviews',
    '',
    'Engine access follows the supported collection configuration and account setup. The current public trial is ChatGPT-only. Answers are collected from the consumer apps and from provider APIs; a collected answer can differ from what a signed-in user sees.',
    '',
    '## Public pages',
    '',
    ...pages.filter((page) => page.kind === 'page').map(link),
    `- [Documentation](${docsHref('/')})`,
    `- [MCP](${docsHref('/mcp/')})`,
    `- [Agent](${docsHref('/agent/')})`,
    '',
    '## Policies',
    '',
    `CiteLadder's policies are published here and bind ${PARENT_COMPANY.legalName}.`,
    ...pages.filter((page) => page.kind === 'policy').map(link),
    '',
  ].join('\n');
}
