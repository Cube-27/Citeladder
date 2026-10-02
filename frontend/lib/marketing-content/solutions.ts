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
      label: 'Build a clearer visibility report',
      href: '/blog/verify-improve-ai-search-visibility',
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
      label: 'Investigate citation opportunities',
      href: '/blog/action-playbook-winning-ai-citations',
    },
    cta: 'Discuss a team workflow',
    scene: 'health',
  },
  {
    id: 'founders',
    label: 'Founders',
    eyebrow: 'For founders',
    title: 'Know if AI engines recommend you before your prospects search.',
    lead: 'A seeded sample crawl and transparent scores on your own API keys — see where AI names you, or a rival.',
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
    guide: { label: 'Audit website readiness', href: '/blog/auditing-content-for-llms-ai-search' },
    cta: 'Discuss an ecommerce workflow',
    scene: 'commerce',
  },
  {
    id: 'pr',
    label: 'PR & communications',
    eyebrow: 'For PR & comms',
    title: 'Prove your media narrative landed inside AI answer engines.',
    lead: 'Citation ownership per prompt, query fanout across engines, and exports built for stakeholder reports.',
    cta: 'See citation evidence',
    scene: 'citations',
  },
];
