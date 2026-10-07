/**
 * Audience-segment content for `/solutions`.
 *
 * One idea per team: who it is for, the one proof it needs, and the product
 * surface that shows it. `scene` selects which evidence panel carries the
 * section — the panels are the content here, the copy stays out of their way.
 * They show the SHAPE of a surface (rows, bars, chips) and never an invented
 * customer result.
 */
export type SolutionScene = 'share' | 'health' | 'sample' | 'commerce' | 'citations';

export type SolutionSegment = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  lead: string;
  body?: string;
  guide?: { label: string; href: string };
  cta: string;
  scene: SolutionScene;
};

export const SOLUTIONS_HERO = {
  eyebrow: 'Solutions',
  title: 'AI visibility workflows for the teams behind your brand.',
  lead: 'Different teams ask different questions of the same evidence. Use tracked answers and website findings to explain a result, choose an investigation and agree on the next step.',
} as const;

export const SOLUTION_SEGMENTS: readonly SolutionSegment[] = [
  {
    id: 'agencies',
    label: 'Agencies',
    eyebrow: 'For agencies',
    title: 'Give clients a report they can question and understand.',
    lead: 'Build reporting around a defined prompt portfolio, clear measurement rules and examples of the underlying answers. Explain what changed, which questions were covered and what remains uncertain.',
    body: 'Use the findings to propose specific work, such as correcting a product explanation or investigating a repeatedly cited source.',
    guide: {
      label: 'Explore AI Visibility',
      href: '/platform/ai-visibility',
    },
    cta: 'Discuss an agency workflow',
    scene: 'share',
  },
  {
    id: 'in-house',
    label: 'In-house teams',
    eyebrow: 'For in-house teams',
    title: 'Connect visibility findings to a practical work list.',
    lead: 'Review the questions where your brand appears, the sources associated with those answers and the website findings worth investigating. Give marketing, content and web teams a common starting point for deciding what to improve.',
    body: 'Keep observed visibility separate from referral traffic and commercial outcomes so internal reporting remains clear.',
    guide: {
      label: 'Explore Demand Intelligence',
      href: '/platform/demand-intelligence',
    },
    cta: 'Discuss a team workflow',
    scene: 'health',
  },
  {
    id: 'founders',
    label: 'Founders',
    eyebrow: 'For founders',
    title: 'Know if AI engines recommend you before your prospects search.',
    lead: 'Start with a limited AI visibility trial to inspect collected answers and competitor observations. Discuss broader diagnostics and content workflows in a demo.',
    guide: { label: 'Explore the platform', href: '/platform' },
    cta: 'See first audit sample',
    scene: 'sample',
  },
  {
    id: 'commerce',
    label: 'Ecommerce',
    eyebrow: 'For ecommerce teams',
    title: 'Investigate the product questions buyers need answered.',
    lead: 'Start with use cases, compatibility, selection criteria and product limitations. Review how those questions are answered and whether your own pages provide clear, accessible information.',
    body: 'Use source analysis and page-level checks to choose focused improvements to relevant product, category or buying-guide content.',
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
    eyebrow: 'For PR & comms',
    title: 'Investigate how your brand appears in collected answers.',
    lead: 'Inspect cited domains and pages in their answer context. Available retrieval evidence can support an investigation; it does not prove why an engine selected a source.',
    guide: { label: 'Explore Citation Intelligence', href: '/platform/citation-intelligence' },
    cta: 'See citation evidence',
    scene: 'citations',
  },
];
