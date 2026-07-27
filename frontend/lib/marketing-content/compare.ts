/**
 * Competitor-comparison content for /compare and /compare/[competitor].
 *
 * Honest-framing rule: every `searchify` cell is grounded in this repo's own
 * source code; a `competitor` cell is present only when the owner has
 * verified that fact first-party. An absent `competitor` field renders the
 * explicit unverified state — the page would rather show a gap than a guess.
 * `tagline`, `lastReviewed` and `verdict` are likewise owner-supplied and are
 * omitted while absent. A page may flip `verified` to true only when EVERY
 * row carries an owner-verified competitor cell.
 */

export type ComparisonRow = {
  dimension: string;
  searchify: string;
  /** Owner-verified competitor fact. Absent = not independently verified. */
  competitor?: string;
};

export type Competitor = {
  slug: string;
  name: string;
  /** Owner-supplied one-line positioning, in the vendor's own words. Absent = omitted. */
  tagline?: string;
  /** ISO date the owner last verified this vendor, e.g. '2026-08-14'. Absent = never verified. */
  lastReviewed?: string;
  /** True only when EVERY row carries an owner-verified competitor cell. */
  verified: boolean;
  rows: readonly ComparisonRow[];
  /** Owner-supplied verdict. Absent = the verdict block is omitted. */
  verdict?: string;
};

/**
 * The Searchify column, shared by every comparison — the dimensions are the
 * same on each detail page, and every competitor cell starts absent. When you
 * research a competitor, fill their rows with verified `competitor` cells and
 * stamp `lastReviewed` on the entry.
 */
export const SEARCHIFY_COLUMN: readonly { dimension: string; searchify: string }[] = [
  {
    dimension: 'Engines covered',
    searchify:
      'ChatGPT, Gemini, and Claude — one audit runs the same prompts across all three, ' +
      'side by side, on your own provider keys.',
  },
  {
    dimension: 'Scoring model',
    searchify:
      'Deterministic and versioned — explicit analyzers and scoring rules over persisted ' +
      'evidence, with analyzer and scoring-rule versions attached to every projection. ' +
      'Same data, same score.',
  },
  {
    dimension: 'Evidence drill-down',
    searchify:
      'Every headline metric links to the exact persisted run — raw response text, ' +
      'classified citations, and query-fanout evidence included.',
  },
  {
    dimension: 'Bring your own keys',
    searchify:
      'BYOK only — provider keys are Fernet-encrypted at rest, resolved only at execution ' +
      'time, and never returned in API responses, logged, or sent as part of a prompt.',
  },
  {
    dimension: 'Site health / AEO auditing',
    searchify:
      'Built in — first-party SSRF-bounded crawler, Technical + AEO scores, grouped issues ' +
      'with remediation, per-URL diagnostics, and workspace-scoped CSV/Markdown exports.',
  },
  {
    dimension: 'Provenance',
    searchify:
      'Every derived number is stamped with the analyzer and rule version that produced ' +
      'it — scoring-v1, sh-rules-2, opp-formula-1 — so a score change is attributable to ' +
      'data or to code.',
  },
  {
    dimension: 'Site health depth',
    searchify:
      '33 deterministic rules across 8 categories, Technical and AEO weighted 50/50, ' +
      'plus AI-crawler stance detection and an /llms.txt check.',
  },
  {
    dimension: 'Price transparency',
    searchify:
      'Published flat-rate plans: Free to start, $49/month before applicable tax for ' +
      'Paid, and a sales-assisted Enterprise agreement. Model usage is billed by your ' +
      'own provider at their rates and never marked up.',
  },
];

/** "How we compare fairly" claims on the /compare index — all repo-grounded. */
export const FAIRNESS_POINTS = [
  'Deterministic scoring — versioned rules over persisted evidence',
  'BYOK — audits run on your own provider keys',
  'Evidence-first scoring — no LLM-as-judge',
] as const;

/** "Searchify at a glance" fact rows on the /compare index. */
export const FACT_ROWS = [
  { key: 'Engines', value: 'ChatGPT · Gemini · Claude — one audit' },
  { key: 'Scoring', value: 'Deterministic rules, versioned projections' },
  { key: 'Evidence', value: 'Every metric drills to the raw run' },
  { key: 'Keys', value: 'BYOK · Fernet-encrypted at rest' },
  { key: 'Site health', value: 'Technical + AEO auditing built in' },
  { key: 'Provenance', value: 'Analyzer + rule version on every projection' },
] as const;

// The competitor cell stays absent on every row until the owner verifies it
// first-party — derived once from the corrected column so the unverified
// pages can never drift from the Searchify side.
const UNVERIFIED_ROWS: readonly ComparisonRow[] = SEARCHIFY_COLUMN.map((row) => ({ ...row }));

/**
 * The published comparisons. Vendor names only — no tagline, no capability,
 * no price, no verdict — until first-party review fills them (owner blockers
 * B9–B12). `verified: false` keeps every competitor cell in the explicit
 * unverified state.
 */
export const COMPETITORS: readonly Competitor[] = [
  { slug: 'profound', name: 'Profound', verified: false, rows: UNVERIFIED_ROWS },
  { slug: 'otterly-ai', name: 'Otterly AI', verified: false, rows: UNVERIFIED_ROWS },
  { slug: 'scrunch-ai', name: 'Scrunch AI', verified: false, rows: UNVERIFIED_ROWS },
  { slug: 'peec-ai', name: 'Peec AI', verified: false, rows: UNVERIFIED_ROWS },
];
