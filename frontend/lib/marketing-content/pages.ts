export type PageRecord = Readonly<{
  path: `/${string}`;
  title: string;
  metaTitle: string;
  description: string;
  updated: string;
}>;

export const PAGES = {
  home: {
    path: '/',
    title: 'CiteLadder',
    metaTitle: 'AI visibility and search intelligence software | CiteLadder',
    description:
      'Track how ChatGPT, Gemini, Claude and Google AI Overviews mention and cite your brand, check your site and search data, and plan fixes with CiteLadder.',
    updated: '2026-11-06',
  },
  pricing: {
    path: '/pricing',
    title: 'Pricing',
    metaTitle: 'AI visibility software pricing | CiteLadder',
    description:
      'Explore CiteLadder plans, provider-key usage and early-access options. Review published limits and confirm availability before choosing a plan.',
    updated: '2026-11-06',
  },
  enterprise: {
    path: '/enterprise',
    title: 'Enterprise',
    metaTitle: 'Enterprise AEO platform with auditable scoring | CiteLadder',
    description:
      'Enterprise AEO platform with auditable scoring: every result traces to a stored answer, the scoring code is public under AGPL-3.0, keys are yours and evidence stays in your workspace.',
    updated: '2026-11-05',
  },
  solutions: {
    path: '/solutions',
    title: 'Solutions',
    metaTitle: 'AI visibility workflows for marketing teams | CiteLadder',
    description:
      'Explore AI visibility workflows for agencies, in-house teams and ecommerce brands. Connect tracked answers, cited sources and website investigations.',
    updated: '2026-11-06',
  },
  shareOfVoice: {
    path: '/ai-search-share-of-voice',
    title: 'AI search share of voice',
    metaTitle: 'AI search share of voice tracking | CiteLadder',
    description:
      'Compare your brand with competitors across a consistent set of AI prompts. See the recorded answers behind each visibility change.',
    updated: '2026-11-06',
  },
  faq: {
    path: '/faq',
    title: 'FAQ',
    metaTitle: 'AI visibility and citation tracking FAQ | CiteLadder',
    description:
      'Understand how CiteLadder tracks AI visibility, what mentions and citations mean, and how to interpret observed results alongside your other analytics.',
    updated: '2026-11-06',
  },
  aiInstructions: {
    path: '/ai-instructions',
    title: 'AI Instructions',
    metaTitle: 'AI Instructions · CiteLadder',
    description:
      'Official CiteLadder facts and guidance for AI assistants: product identity, capabilities, evidence, pricing sources, and accurate attribution.',
    updated: '2026-11-04',
  },
  entityMap: {
    path: '/entity-map',
    title: 'Entity Map',
    metaTitle: 'Entity Map · CiteLadder',
    description:
      "Explore CiteLadder's product, Cube27 company identity, people, capabilities, and AEO concepts through linked definitions and official sources.",
    updated: '2026-11-04',
  },
  compare: {
    path: '/compare',
    title: 'Compare AI visibility tools',
    metaTitle: 'Compare AI visibility software and workflows | CiteLadder',
    description:
      'Compare CiteLadder with Profound, Otterly AI, Scrunch and Peec AI. Review product focus, evaluation questions and current first-party sources.',
    updated: '2026-11-06',
  },
} as const satisfies Record<string, PageRecord>;
