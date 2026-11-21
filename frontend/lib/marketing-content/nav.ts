import { docsHref } from '@/lib/config/docs';

import { PARENT_COMPANY } from './legal';
import { FOOTER_LEGAL_LINKS } from './legal-documents';
import { STUDY_INDEXES } from './studies/indexes';
import { CITELADDER_GITHUB, CITELADDER_LINKEDIN, CITELADDER_X } from './social';

type NavDropKey = 'platform' | 'solutions' | 'resources';

export type NavDropItem =
  | { title: string; desc: string; href: string; external?: boolean }
  | { num: string; title: string; desc: string; href: string };

type NavDropGroup = { label?: string; items: readonly NavDropItem[] };

type LabelledNavDropGroup = { label: string; items: readonly NavDropItem[] };

type NavDropBase = { label: string; href: string };

export type NavDrop =
  | (NavDropBase & {
      key: Exclude<NavDropKey, 'resources'>;
      groups: readonly NavDropGroup[];
    })
  | (NavDropBase & {
      key: 'resources';
      groups: readonly LabelledNavDropGroup[];
      sections: readonly string[];
    });

export const PLATFORM_OVERVIEW = {
  title: 'Platform overview',
  desc: 'AI answers, site checks and content work.',
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
        desc: 'See which AI answers name your brand.',
        href: '/platform/ai-visibility',
      },
      {
        title: 'Cited Sources',
        desc: 'See the domains and pages AI answers cite.',
        href: '/platform/cited-sources',
      },
      {
        title: 'AI Referral Analytics',
        desc: 'See visits from AI assistants and where they land.',
        href: '/platform/ai-referral-analytics',
      },
      {
        title: 'Product Visibility',
        desc: 'See where your products rank in AI answers.',
        href: '/platform/product-visibility',
      },
    ],
  },
  {
    label: 'Diagnose',
    items: [
      {
        title: 'Site Health',
        desc: 'Find technical, content and crawler-access issues.',
        href: '/platform/site-health',
      },
      {
        title: 'Search Demand',
        desc: 'Find gaps in your own search and analytics data.',
        href: '/platform/search-demand',
      },
      {
        title: 'Keyword Research',
        desc: 'Research keywords, competitors and backlinks.',
        href: '/platform/keyword-research',
      },
    ],
  },
  {
    label: 'Improve & connect',
    items: [
      {
        title: 'Content Optimization',
        desc: 'Find the content AI answers cite that your site lacks.',
        href: '/platform/content-optimization',
      },
      {
        title: 'AI Agent',
        desc: 'Ask about your project data and plan the work.',
        href: '/platform/agents',
      },
      {
        title: 'MCP',
        desc: 'Use your CiteLadder data from your own AI assistant.',
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
            desc: 'How AI answers rank your products',
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
    sections: [
      ...Object.values(STUDY_INDEXES).map((index) => index.path),
      '/best-ai-visibility-platforms',
    ],
    groups: [
      {
        label: 'Learn',
        items: [
          {
            title: 'GEO guide',
            desc: 'What GEO is and where to start',
            href: '/generative-engine-optimization',
          },
          {
            title: 'AI citation tracking guide',
            desc: 'How to measure and read AI citations',
            href: '/ai-citation-tracking',
          },
          {
            title: 'ChatGPT brand mentions guide',
            desc: 'Track what ChatGPT says about your brand',
            href: '/track-brand-mentions-chatgpt',
          },
          {
            title: 'Blog & guides',
            desc: 'Guides and research on AI visibility',
            href: '/blog',
          },
          {
            title: STUDY_INDEXES.research.title,
            desc: STUDY_INDEXES.research.metaTitle.replace(/ \| CiteLadder$/u, ''),
            href: STUDY_INDEXES.research.path,
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
          { title: 'FAQ', desc: 'AEO, evidence, security and billing questions', href: '/faq' },
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
            desc: 'How CiteLadder compares with other tools',
            href: '/compare',
          },
        ],
      },
    ],
  },
];

const RESEARCH_LINKS = [
  ...Object.values(STUDY_INDEXES).map((index) => ({ title: index.title, href: index.path })),
  { title: 'AI search market share 2026', href: '/blog/ai-search-market-share-2026' },
  { title: 'AI referral traffic statistics', href: '/blog/ai-referral-traffic-statistics-2026' },
  { title: 'Google AI Overviews statistics', href: '/blog/google-ai-overviews-statistics-2026' },
  { title: 'Agentic commerce statistics', href: '/blog/agentic-commerce-statistics-2026' },
  { title: 'Ads in AI answers', href: '/blog/ads-in-ai-answers' },
  { title: 'Profound alternatives', href: '/compare/profound-alternatives' },
];

export const NAV_LINKS = [
  { label: 'Enterprise', href: '/enterprise' },
  { label: 'Pricing', href: '/pricing' },
] as const;

export type SocialNetwork = 'github' | 'linkedin' | 'x';

export type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

type SocialLink = { network: SocialNetwork; label: string; href: string };

export type FooterColumn = { key: string; label: string; links: readonly FooterLink[] };

export const FOOTER_TAGLINE = 'See what AI answers say about your brand, and what to fix next.';

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    key: 'platform',
    label: 'Platform',
    links: [
      { label: PLATFORM_OVERVIEW.title, href: PLATFORM_OVERVIEW.href },
      ...PLATFORM_GROUPS.flatMap((group) =>
        group.items.map((item) => ({ label: item.title, href: item.href })),
      ),
    ],
  },
  ...NAV_DROPS.filter((drop) => drop.key !== 'platform').map((drop) => ({
    key: drop.key,
    label: drop.label,
    links: drop.groups.flatMap((group) =>
      group.items.map((item) => ({
        label: item.title,
        href: item.href,
        external: 'external' in item && item.external,
      })),
    ),
  })),
  {
    key: 'research',
    label: 'Research',
    links: RESEARCH_LINKS.map((item) => ({ label: item.title, href: item.href })),
  },
  {
    key: 'company',
    label: 'Company',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Enterprise', href: '/enterprise' },
      { label: 'Pricing', href: '/pricing' },
      { label: PARENT_COMPANY.name, href: PARENT_COMPANY.href, external: true },
      { label: 'AI Instructions', href: '/ai-instructions' },
      { label: 'Entity Map', href: '/entity-map' },
    ],
  },
];

export const FOOTER_SOCIAL: readonly SocialLink[] = [
  { network: 'github', label: 'github.com', href: CITELADDER_GITHUB },
  { network: 'x', label: 'x.com', href: CITELADDER_X },
  { network: 'linkedin', label: 'linkedin.com', href: CITELADDER_LINKEDIN },
];

export const FOOTER_POLICY_LINKS = FOOTER_LEGAL_LINKS.filter((link) => link.href !== '/contact');

export const DEMO_HREF = '/contact';
export const DEMO_EXTERNAL = false;
export const DEMO_CTA = 'Book a demo';
