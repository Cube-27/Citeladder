/**
 * Audience-segment content for `/solutions`.
 *
 * Copy is carried over verbatim from the approved marketing content audit —
 * these are the pains each team actually reports and the capabilities that
 * answer them. `scene` selects which evidence panel renders beside the copy;
 * the panels show the SHAPE of a surface (rows, bars, chips) and never an
 * invented customer result.
 */
export type SolutionScene = 'share' | 'health' | 'sample' | 'citations';

export type SolutionSegment = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  pains: readonly string[];
  mappings: readonly string[];
  cta: string;
  scene: SolutionScene;
};

export const SOLUTIONS_HERO = {
  eyebrow: 'Solutions',
  title: 'One evidence layer for',
  accent: 'every team behind the brand.',
  lead: 'Searchify measures how answer engines talk about you — then hands each team the proof, in the format it reports in.',
} as const;

export const SOLUTION_SEGMENTS: readonly SolutionSegment[] = [
  {
    id: 'agencies',
    label: 'Agencies',
    eyebrow: 'For agencies',
    title: 'Show the retainer worked, in evidence a client can re-check.',
    pains: [
      '“What did this retainer actually get us?” deserves a better answer than screenshots.',
      'AI visibility is a new line item clients can’t verify in their usual dashboards.',
      'Every client runs a different mix of engines, competitors and prompts.',
    ],
    mappings: [
      'Multi-project workspaces — one project per client, isolated by UUID scoping',
      'Per-client evidence exports — authenticated CSV + Markdown downloads',
      'Competitor benchmarking per market — mentions, citation ownership, share of voice',
      'Deterministic scores the client can re-check — every metric drills to its raw run',
      'A deterministic, versioned priority list — grouped issues with remediation text, and ranked opportunities you can hand to whoever fixes them',
    ],
    cta: 'See the agency workflow',
    scene: 'share',
  },
  {
    id: 'in-house',
    label: 'In-house teams',
    eyebrow: 'For in-house teams',
    title: 'A number that survives the board deck.',
    pains: [
      'AI answers shape pipeline, but there’s no number that survives the board deck.',
      'Visibility shifts week to week, and nobody trusts the explanation.',
      'Technical and AEO fixes live scattered across crawlers, docs and gut feel.',
    ],
    mappings: [
      'Cross-run trends with engine, time-range and granularity controls',
      '33 deterministic site-health rules across 8 categories — Technical and AEO weighted 50/50, each outcome inspectable',
      'Per-URL diagnostics — delivery facts, page facts, evidence, issue history',
      'Share-of-voice benchmarks against the competitors leadership names',
      'Search Console, GA4 and Bing Webmaster Tools on a recurring sync — a re-sync supersedes the earlier numbers rather than double-counting them',
    ],
    cta: 'See the reporting surfaces',
    scene: 'health',
  },
  {
    id: 'founders',
    label: 'Founders',
    eyebrow: 'For founders',
    title: 'Find out whether engines recommend you — before a buyer does.',
    pains: [
      'Buyers ask ChatGPT, Gemini and Claude before they ever reach your site.',
      'Enterprise AEO platforms are priced for companies ten times your size.',
      'You need a number you can sanity-check, not another black-box score.',
    ],
    mappings: [
      'Free sample Site Health crawl — deterministic, seeded, capped URLs',
      'BYOK keeps audit usage on your own provider accounts, at provider rates',
      'Deterministic scoring you can recompute from the raw response',
      'Provenance stamps on every projection — recompute any score from the persisted run',
    ],
    cta: 'See what a first audit shows',
    scene: 'sample',
  },
  {
    id: 'commerce',
    label: 'Ecommerce',
    eyebrow: 'For ecommerce teams',
    title: 'Find out which products the engines actually recommend.',
    pains: [
      'Answer engines shortlist products, and your catalog is nowhere in the shortlist.',
      'You can see a mention, not whether the engine quoted the right price.',
      'Nobody can say which competitor keeps appearing beside your SKUs.',
    ],
    mappings: [
      'Product share of voice and rank distribution per engine, from persisted runs',
      'Price accuracy — every quoted price checked against your own catalog',
      'Competitor co-placement — which rival SKUs appear alongside yours',
      'Buyer-destination mix — where an answer sends the shopper next',
      'Shopify catalog and order sync, or CSV import',
    ],
    cta: 'See the commerce workflow',
    scene: 'share',
  },
  {
    id: 'pr',
    label: 'PR & communications',
    eyebrow: 'For PR & comms',
    title: 'Prove the narrative landed where answers are written.',
    pains: [
      'Coverage lands, but you can’t see whether AI answers pick it up.',
      'Engines cite competitor pages for the narratives your team owns.',
      'Impact reports stop at reach and impressions — nothing about answers.',
    ],
    mappings: [
      'Mention + citation tracking with raw-response evidence for every claim',
      'Citation ownership benchmarking — whose pages get cited, per prompt',
      'Query-fanout evidence — how one question expands into real engine queries',
      'CSV + Markdown exports that drop straight into coverage reports',
    ],
    cta: 'See citation evidence',
    scene: 'citations',
  },
];
