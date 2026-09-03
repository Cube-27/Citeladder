/**
 * Competitor-comparison content for /compare and /compare/[competitor].
 *
 * Sourcing rule (internal): every `citeladder` cell is grounded in this repo's
 * own source code; every `competitor` cell must be confirmed first-party on
 * the vendor's own site before it ships. A row ships only when BOTH cells are
 * written. Unsupported dimensions are omitted.
 *
 * Copy rule: one short claim per cell. Detail lives in the product, not here.
 */
import { CONTENT_REVIEWED } from './people';

type ComparisonRow = {
  dimension: string;
  citeladder: string;
  competitor: string;
};

export type Competitor = {
  slug: string;
  name: string;
  /** One-line positioning, drawn from the vendor's own site copy. */
  tagline: string;
  /** Unique opening for the detail page. Not a template. */
  lead: string;
  /** Unique SERP description. */
  metaDescription: string;
  /** ISO date of the last first-party review, e.g. '2026-08-01'. */
  lastReviewed: string;
  rows: readonly ComparisonRow[];
  /** Short editorial verdict, in our voice. */
  verdict: string;
  /** Honest fit: the customer profile the other tool genuinely serves well. */
  betterFit: string;
};

const OURS = {
  engines: {
    dimension: 'Engines',
    citeladder: 'ChatGPT, Gemini, Claude. Same prompts, one audit, your keys.',
  },
  scoring: {
    dimension: 'Scoring',
    citeladder: 'Deterministic, versioned rules over persisted evidence.',
  },
  evidence: {
    dimension: 'Evidence',
    citeladder: 'Every metric opens the raw run, citations and query fanout.',
  },
  byok: {
    dimension: 'BYOK',
    citeladder: 'Your keys only. Fernet-encrypted, never returned or logged.',
  },
  siteHealth: {
    dimension: 'Site health',
    citeladder: 'Built-in Web Fundamentals + AEO audit with remediation.',
  },
  provenance: {
    dimension: 'Provenance',
    citeladder: 'Analyzer + rule version stamped on every projection.',
  },
  price: {
    dimension: 'Pricing',
    citeladder: 'Published self-serve plans; Enterprise by quote; provider usage not marked up.',
  },
} as const satisfies Record<string, { dimension: string; citeladder: string }>;

/** Fairness strip on /compare — repo-grounded, one line each. */
export const FAIRNESS_POINTS = [
  'Deterministic scoring: versioned rules, not an LLM judge',
  'BYOK: measurement runs on your provider keys',
  'Evidence first: every metric links to persisted run evidence',
] as const;

/** CiteLadder glance facts on /compare. */
export const FACT_ROWS = [
  { key: 'Engines', value: 'ChatGPT · Gemini · Claude' },
  { key: 'Scoring', value: 'Versioned deterministic rules' },
  { key: 'Evidence', value: 'Metric → run → answer' },
  { key: 'Keys', value: 'BYOK · encrypted at rest' },
  { key: 'Site health', value: 'Web Fundamentals + AEO' },
  { key: 'Provenance', value: 'Analyzer + rule on every score' },
] as const;

const REVIEWED = CONTENT_REVIEWED;

/**
 * Published comparisons. Sourced from each vendor's public site as of
 * `lastReviewed`. Dimensions the vendor does not publish are omitted.
 */
export const COMPETITORS: readonly Competitor[] = [
  {
    slug: 'profound',
    name: 'Profound',
    tagline: 'Full-stack marketing platform for AI search.',
    lead: 'Profound is built as a wide, hosted AI search suite. We are narrower: three engines, your keys, and a score you can open to the raw answer. Choose them for packaging. Choose us when procurement asks how the number was made.',
    metaDescription:
      'Profound offers a hosted multi-engine suite. CiteLadder measures ChatGPT, Gemini, and Claude on your keys with deterministic scores and raw-answer evidence.',
    lastReviewed: REVIEWED,
    rows: [
      {
        ...OURS.engines,
        competitor: 'ChatGPT on Starter; three engines on Growth; nine on Enterprise.',
      },
      {
        ...OURS.scoring,
        competitor:
          'Hosted daily analysis for citations, sentiment and rank. Methodology unpublished.',
      },
      {
        ...OURS.evidence,
        competitor: 'Dashboards for share of voice, citations, sentiment and rank.',
      },
      {
        ...OURS.byok,
        competitor: 'Hosted platform keys. No BYOK on public plans.',
      },
      {
        ...OURS.siteHealth,
        competitor:
          'Agent Analytics via CDN and server integrations. Not a built-in site-health audit.',
      },
      {
        ...OURS.provenance,
        competitor: 'No published scoring/analysis versioning.',
      },
      {
        ...OURS.price,
        competitor: 'Starter $99/mo · Growth $399/mo · Enterprise custom.',
      },
    ],
    verdict:
      'Profound wins on enterprise packaging, agent workflows, and engine breadth at the top tier. We win when you need published self-serve pricing, BYOK, and a score that opens to the persisted answer.',
    betterFit:
      'Large marketing orgs that want a hosted all-in-one platform with agents, demand data, SOC 2 and SSO.',
  },
  {
    slug: 'otterly-ai',
    name: 'Otterly AI',
    tagline: 'AI search monitoring, kept simple.',
    lead: 'Otterly is monitoring with a low entry price and add-on engines. We run ChatGPT, Gemini, and Claude on one audit without per-engine add-ons, then keep the raw response under the metric.',
    metaDescription:
      'Otterly AI is simple hosted monitoring with engine add-ons. CiteLadder runs a three-engine BYOK audit with versioned scoring and evidence under every metric.',
    lastReviewed: REVIEWED,
    rows: [
      {
        ...OURS.engines,
        competitor: 'Four engines included; Claude, Gemini and AI Mode are paid add-ons.',
      },
      {
        ...OURS.scoring,
        competitor:
          'Daily hosted tracking for coverage, position, sentiment and SoV. Methodology unpublished.',
      },
      {
        ...OURS.evidence,
        competitor: 'Link-citation analysis with reports and exports.',
      },
      {
        ...OURS.byok,
        competitor: 'Hosted. No BYOK. No extra provider subscriptions required.',
      },
      {
        ...OURS.siteHealth,
        competitor: 'GEO crawlability audit with monthly URL quotas by plan.',
      },
      {
        ...OURS.provenance,
        competitor: 'No documented scoring/analysis versioning.',
      },
      {
        ...OURS.price,
        competitor: 'Lite $29 · Standard $189 · Premium $489; engines billed per add-on.',
      },
    ],
    verdict:
      'Otterly is the easy start: lower entry price, unlimited seats, engines as add-ons. We are the inspectable audit: three engines included, versioned rules, site health in the same workspace.',
    betterFit:
      'Solo marketers or small teams watching a few prompts on major engines at the lowest entry price.',
  },
  {
    slug: 'scrunch-ai',
    name: 'Scrunch AI',
    tagline: 'AI customer experience. Get your site ready for agents.',
    lead: 'Scrunch treats the problem as infrastructure: serve agents a different view of the site. We treat it as measurement: crawl what people and engines can already see, then score ChatGPT, Gemini, and Claude with a trail.',
    metaDescription:
      'Scrunch AI optimizes what agents fetch at the edge. CiteLadder measures ChatGPT, Gemini, and Claude with deterministic AEO health on the pages you already publish.',
    lastReviewed: REVIEWED,
    rows: [
      {
        ...OURS.engines,
        competitor: 'Brand presence across answer engines; public pages omit a per-plan roster.',
      },
      {
        ...OURS.scoring,
        competitor: 'Monitoring with citations inside a broader suite. Methodology unpublished.',
      },
      {
        ...OURS.evidence,
        competitor: 'Citations reporting for brand references in AI answers.',
      },
      {
        ...OURS.siteHealth,
        competitor: 'Edge AXP serves AI-optimized content, plus agent traffic analytics.',
      },
      {
        ...OURS.provenance,
        competitor: 'No published scoring/analysis versioning.',
      },
    ],
    verdict:
      'Same diagnosis, different treatment. Scrunch serves agents at the edge. We measure ChatGPT, Gemini and Claude with deterministic scores and built-in AEO health on the published site.',
    betterFit:
      'Teams that want the site to serve optimized content to AI agents at the edge: infrastructure, not only measurement.',
  },
  {
    slug: 'peec-ai',
    name: 'Peec AI',
    tagline: 'AI search analytics for marketing teams.',
    lead: 'Peec is a clean analytics dashboard across six platforms. We trade that breadth for proof: three engines, your keys, site health, and a metric that still opens to the answer.',
    metaDescription:
      'Peec AI covers six AI platforms with hosted analytics. CiteLadder covers ChatGPT, Gemini, and Claude with BYOK, site health, and raw-answer provenance.',
    lastReviewed: REVIEWED,
    rows: [
      {
        ...OURS.engines,
        competitor:
          'Six platforms on every plan: ChatGPT, AI Mode, Overviews, Copilot, Perplexity, Gemini.',
      },
      {
        ...OURS.scoring,
        competitor: 'Daily visibility, position and sentiment analytics. Methodology unpublished.',
      },
      {
        ...OURS.evidence,
        competitor: 'Source and citation insights with exports and Looker Studio.',
      },
      {
        ...OURS.byok,
        competitor: 'Hosted analytics. No BYOK on public plans.',
      },
      {
        ...OURS.provenance,
        competitor: 'No documented scoring/analysis versioning.',
      },
    ],
    verdict:
      'Peec is the tidy six-platform dashboard with exports your agency already knows. We are the narrower stack with versioned scores, built-in site health, and every metric tied to the raw answer.',
    betterFit:
      'SEO and content teams that want a simple analytics dashboard across major AI platforms with agency-friendly reporting.',
  },
];
