/**
 * Navigation content for the marketing chrome (desktop dropdowns + the mobile
 * accordions, footer, product cards and published platform routes).
 */
import { docsHref } from '@/lib/config/docs';

export type NavDropKey = 'platform' | 'solutions' | 'resources';

export type NavDropItem =
  | { title: string; desc: string; href: string; external?: boolean }
  | { num: string; title: string; desc: string; href: string };

type NavDropGroup = { label?: string; items: readonly NavDropItem[] };

export type NavDrop = {
  key: NavDropKey;
  label: string;
  href: string;
  groups: readonly NavDropGroup[];
};

export const PLATFORM_OVERVIEW = {
  title: 'Platform overview',
  desc: 'AI visibility, website evidence and action.',
  href: '/platform',
} as const;

export const PLATFORM_GROUPS: readonly {
  label: string;
  items: readonly { title: string; desc: string; href: string }[];
}[] = [
  {
    label: 'Measure',
    items: [
      {
        title: 'AI Visibility',
        desc: 'Track brand presence across your buyer questions.',
        href: '/platform/ai-visibility',
      },
      {
        title: 'Citation Intelligence',
        desc: 'Inspect the domains and pages cited in answers.',
        href: '/platform/citation-intelligence',
      },
      {
        title: 'AI Referral Analytics',
        desc: 'Review identifiable AI visits and landing-page outcomes.',
        href: '/platform/ai-referral-analytics',
      },
      {
        title: 'Commerce Intelligence',
        desc: 'Measure product and category appearances in AI answers.',
        href: '/platform/commerce-intelligence',
      },
    ],
  },
  {
    label: 'Diagnose',
    items: [
      {
        title: 'Site Health',
        desc: 'Investigate technical, content and crawler-access findings.',
        href: '/platform/site-health',
      },
      {
        title: 'Demand Intelligence',
        desc: 'Find opportunities in your first-party search data.',
        href: '/platform/demand-intelligence',
      },
      {
        title: 'Search Intelligence',
        desc: 'Research keywords, competitors and backlinks.',
        href: '/platform/search-intelligence',
      },
    ],
  },
  {
    label: 'Improve & connect',
    items: [
      {
        title: 'Content Intelligence',
        desc: 'Prepare briefs, page edits and internal-link plans.',
        href: '/platform/content-intelligence',
      },
      {
        title: 'AI Agent',
        desc: 'Work through findings with saved project context.',
        href: '/platform/agents',
      },
      {
        title: 'MCP',
        desc: 'Read CiteLadder evidence and make changes you approve from AI assistants.',
        href: '/platform/mcp',
      },
      {
        title: 'Integrations',
        desc: 'Connect search, analytics and provider accounts.',
        href: '/platform/integrations',
      },
    ],
  },
];

/** Editorial publication only: never an entitlement or rollout switch. */
export const PUBLISHED_PLATFORM = [
  PLATFORM_OVERVIEW,
  ...PLATFORM_GROUPS.flatMap((group) => group.items),
];
export function platformLabel(href: string) {
  return PUBLISHED_PLATFORM.find((item) => item.href === href)?.title;
}

export const NAV_DROPS: readonly NavDrop[] = [
  {
    key: 'platform',
    label: 'Platform',
    href: PLATFORM_OVERVIEW.href,
    groups: PLATFORM_GROUPS,
  },
  {
    key: 'solutions',
    label: 'Solutions',
    href: '/solutions',
    groups: [
      {
        items: [
          {
            title: 'Agencies',
            desc: 'Audits for every client workspace',
            href: '/solutions#agencies',
          },
          {
            title: 'In-house teams',
            desc: 'AI answers beside your rankings',
            href: '/solutions#in-house',
          },
          { title: 'Founders', desc: 'See if engines recommend you', href: '/solutions#founders' },
          {
            title: 'Ecommerce',
            desc: 'Product and category answer evidence',
            href: '/solutions#commerce',
          },
          {
            title: 'PR & comms',
            desc: 'See what engines say after a launch',
            href: '/solutions#pr',
          },
        ],
      },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    href: '/blog',
    // Labelled sections, shown side by side as columns (owner, 2026-10-31).
    groups: [
      {
        label: 'Learn',
        items: [
          {
            title: 'GEO guide',
            desc: 'Understand generated answers and where to start',
            href: '/generative-engine-optimization',
          },
          {
            title: 'AI citation tracking guide',
            desc: 'Learn citation measurement and interpretation',
            href: '/ai-citation-tracking',
          },
          {
            title: 'ChatGPT brand mentions guide',
            desc: 'Track what ChatGPT says about your brand',
            href: '/track-brand-mentions-chatgpt',
          },
          {
            title: 'Blog & guides',
            desc: 'Practical guides to AI visibility and site evidence',
            href: '/blog',
          },
        ],
      },
      {
        label: 'Product',
        items: [
          {
            title: 'Documentation',
            desc: 'Guides for the product, the Agent and MCP',
            href: docsHref(),
            external: true,
          },
          {
            title: 'Changelog',
            desc: 'Product updates',
            href: docsHref('/changelog/'),
            external: true,
          },
          { title: 'FAQ', desc: 'Answers on AEO, evidence, security, and billing', href: '/faq' },
          {
            title: 'Open source',
            desc: 'Self-host CiteLadder or use the hosted version',
            href: '/open-source',
          },
        ],
      },
      {
        label: 'Tools',
        items: [
          {
            title: 'Free tools',
            desc: 'Crawler rules, markup and sitemap utilities',
            href: '/tools',
          },
          {
            title: 'LLM rank tracker',
            desc: 'Where your brand ranks inside AI answers',
            href: '/llm-rank-tracker',
          },
          {
            title: 'Compare',
            desc: 'Evidence-led notes on AI visibility platforms',
            href: '/compare',
          },
        ],
      },
    ],
  },
];

/** Data-led guides the footer links from every page; too many for the Resources menu. */
export const RESEARCH_LINKS = [
  { title: 'AI search market share 2026', href: '/blog/ai-search-market-share-2026' },
  { title: 'AI referral traffic statistics', href: '/blog/ai-referral-traffic-statistics-2026' },
  { title: 'Google AI Overviews statistics', href: '/blog/google-ai-overviews-statistics-2026' },
  { title: 'Agentic commerce statistics', href: '/blog/agentic-commerce-statistics-2026' },
  { title: 'Ads in AI answers', href: '/blog/ads-in-ai-answers' },
  { title: 'Profound alternatives', href: '/compare/profound-alternatives' },
] as const;

/** Plain links that sit after the dropdown triggers. */
export const NAV_LINKS = [
  { label: 'Enterprise', href: '/enterprise' },
  { label: 'Pricing', href: '/pricing' },
] as const;

/**
 * Demo enquiries use CiteLadder's own contact page in the same tab.
 */
export const DEMO_HREF = '/contact';
export const DEMO_EXTERNAL = false;
export const DEMO_CTA = 'Book a demo';
