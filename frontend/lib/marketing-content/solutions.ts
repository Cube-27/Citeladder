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
  cta: string;
  scene: SolutionScene;
};

export const SOLUTIONS_HERO = {
  eyebrow: 'Solutions',
  title: 'One evidence layer for',
  accent: 'every team behind the brand.',
  lead: 'CiteLadder measures how answer engines talk about you, then gives each team proof they can re-check: mentions, citations, and the pages that support the claim.',
} as const;

export const SOLUTION_SEGMENTS: readonly SolutionSegment[] = [
  {
    id: 'agencies',
    label: 'Agencies',
    eyebrow: 'For agencies',
    title: 'Show retainer work with evidence clients can independently verify.',
    lead: 'Per-client workspaces, share-of-voice benchmarks, and exports where every number opens to the run behind it.',
    cta: 'See agency workflow',
    scene: 'share',
  },
  {
    id: 'in-house',
    label: 'In-house teams',
    eyebrow: 'For in-house teams',
    title: 'Executive AI visibility metrics that hold up in board meetings.',
    lead: 'Cross-engine trend lines with site health and analytics synced in — verified numbers, no screenshot decks.',
    cta: 'See reporting surfaces',
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
    title: 'Track product recommendations and price accuracy across AI engines.',
    lead: 'Which products AI shortlists, at what price, and which rival SKUs displace yours.',
    cta: 'See commerce workflow',
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
