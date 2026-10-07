/**
 * Audience-segment content for `/solutions`.
 *
 * One idea per team: who it is for, the proof it needs, and the product view
 * that shows it. `scene` selects which illustrative product view carries the
 * section. Views show the shape of a surface with synthetic data and never an
 * invented customer result.
 */
export type SolutionScene = 'share' | 'health' | 'sample' | 'commerce' | 'citations';

export type SolutionSegment = {
  id: string;
  label: string;
  title: string;
  lead: string;
  body?: string;
  guide?: { label: string; href: string };
  cta: string;
  scene: SolutionScene;
};

export const SOLUTIONS_HERO = {
  title: 'AI visibility workflows for the teams behind your brand.',
  lead: 'Each team asks a different question of the same evidence. Use tracked answers and website findings to explain a result, choose what to investigate and agree on the next step.',
} as const;

export const SOLUTION_SEGMENTS: readonly SolutionSegment[] = [
  {
    id: 'agencies',
    label: 'Agencies',
    title: 'Agencies: client reports that hold up to questions.',
    lead: 'Report on a defined prompt portfolio with clear measurement rules and the underlying answers in view. Explain what changed, which questions were covered and what remains uncertain.',
    body: 'Turn findings into specific proposals, such as correcting a product explanation or investigating a repeatedly cited source.',
    guide: { label: 'Explore AI Visibility', href: '/platform/ai-visibility' },
    cta: 'Discuss an agency workflow',
    scene: 'share',
  },
  {
    id: 'in-house',
    label: 'In-house teams',
    title: 'In-house teams: one starting point for marketing, content and web.',
    lead: 'Review the questions where your brand appears, the sources behind those answers and the website findings worth investigating. Decide together what to improve.',
    body: 'Observed visibility stays separate from referral traffic and commercial outcomes, so internal reporting stays clear.',
    guide: { label: 'Explore Demand Intelligence', href: '/platform/demand-intelligence' },
    cta: 'Discuss a team workflow',
    scene: 'health',
  },
  {
    id: 'founders',
    label: 'Founders',
    title: 'Founders: see whether AI engines recommend you.',
    lead: 'Start with a limited AI visibility trial and inspect the collected answers and competitor observations. Discuss broader diagnostics and content workflows in a demo.',
    guide: { label: 'Explore the platform', href: '/platform' },
    cta: 'See a first audit sample',
    scene: 'sample',
  },
  {
    id: 'commerce',
    label: 'Ecommerce',
    title: 'Ecommerce: the product questions buyers need answered.',
    lead: 'Start with use cases, compatibility, selection criteria and product limitations. Review how those questions are answered and whether your own pages explain them clearly.',
    body: 'Use source analysis and page-level checks to choose focused improvements to product, category or buying-guide content.',
    guide: {
      label: 'Explore Commerce Intelligence for eligible projects',
      href: '/platform/commerce-intelligence',
    },
    cta: 'Discuss an ecommerce workflow',
    scene: 'commerce',
  },
  {
    id: 'pr',
    label: 'PR & communications',
    title: 'PR and communications: how your brand appears in answers.',
    lead: 'Inspect cited domains and pages in their answer context. Available retrieval evidence can support an investigation. It does not prove why an engine selected a source.',
    guide: { label: 'Explore Citation Intelligence', href: '/platform/citation-intelligence' },
    cta: 'See citation evidence',
    scene: 'citations',
  },
];
