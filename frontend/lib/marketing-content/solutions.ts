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
  title: 'How each team uses CiteLadder',
  lead: 'Every team below works from the same tracked AI answers and website findings. Each one comes to them with a different question.',
} as const;

export const SOLUTION_SEGMENTS: readonly SolutionSegment[] = [
  {
    id: 'agencies',
    label: 'Agencies',
    title: 'Agencies: client reports that hold up to questions',
    lead: 'You use this when a client asks why their AI visibility moved. You report on a fixed set of prompts, with the measurement rules stated and the recorded answers one click away. The report says what changed, which questions it covers and what is still uncertain.',
    body: 'Each finding can become a specific proposal, such as correcting how an answer describes a product or looking into a source that keeps getting cited.',
    guide: { label: 'Explore AI Visibility', href: '/platform/ai-visibility' },
    cta: 'Discuss an agency workflow',
    scene: 'share',
  },
  {
    id: 'in-house',
    label: 'In-house teams',
    title: 'In-house teams: one view for content and web',
    lead: 'You use this when content and web teams need to agree on what to fix next. You see the questions where your brand appears, the sources those answers cite and the website findings on your own pages.',
    body: 'Visibility, referral traffic and commercial outcomes are reported as separate numbers, so an internal report never blends them into one.',
    guide: { label: 'Explore Search Demand', href: '/platform/search-demand' },
    cta: 'Discuss a team workflow',
    scene: 'health',
  },
  {
    id: 'founders',
    label: 'Founders',
    title: 'Founders: see whether AI engines recommend you',
    lead: 'You use this when you want to know whether ChatGPT names your company for the questions your buyers ask. The trial shows you the recorded answers and which competitors they mention. Book a demo to talk through site diagnostics and content work.',
    guide: { label: 'Explore the platform', href: '/platform' },
    cta: 'Request a first audit sample',
    scene: 'sample',
  },
  {
    id: 'commerce',
    label: 'Ecommerce',
    title: 'Ecommerce: the product questions buyers ask',
    lead: 'You use this when buyers ask AI about use cases, compatibility, how to choose and what a product cannot do. You see how engines answer those questions and whether your own pages explain the same points clearly.',
    body: 'The cited sources and page-level checks show which product, category or buying-guide page to improve first.',
    guide: {
      label: 'Explore Product Visibility for eligible projects',
      href: '/platform/product-visibility',
    },
    cta: 'Discuss an ecommerce workflow',
    scene: 'commerce',
  },
  {
    id: 'pr',
    label: 'PR & communications',
    title: 'PR and communications: how your brand appears in answers',
    lead: 'You use this when you need to know how engines describe your brand and where they get it from. You see each cited domain and page inside the answer that cited it. Retrieval evidence, where an engine provides it, helps you investigate. It cannot prove why the engine picked a source.',
    guide: { label: 'Explore Cited Sources', href: '/platform/cited-sources' },
    cta: 'See citation evidence',
    scene: 'citations',
  },
];
