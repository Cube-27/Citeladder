import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// ---------------------------------------------------------------------------
// Externally cited pages (`/projects/{id}/source-pages/...`).
//
// Every field here is a persisted projection. The backend never fetches on a
// read, so a page nobody has inspected arrives with `inspection_state:
// 'not_inspected'`, no entities and its own limitation sentence — it is NOT an
// absence, and no surface may render it as one.
// ---------------------------------------------------------------------------

/**
 * One entity's verdict on one page.
 *
 * `state` deliberately mixes page-level outcomes (`not_inspected`, `blocked`,
 * `stale`) with the presence verdicts (`present`, `not_detected`, `ambiguous`,
 * `partial`). The backend resolves the two into one vocabulary so a reader
 * cannot be handed a stale verdict as a current one.
 *
 * `passages` is the quoted line that proves a positive finding. It is empty
 * for anything else, because no passage can demonstrate an absence — that is
 * what `match_method` and the page's `extracted_chars` are for.
 */
export const pageEntityFields = {
  entity_kind: z.string(),
  entity_name: z.string(),
  match_method: z.string(),
  match_count: z.number().int(),
  passages: z.array(z.string()),
} as const;

export const sourcePageEntitySchema = responseObject({
  ...pageEntityFields,
  entity_kind: z.enum(['brand', 'competitor']),
  // The resolver's vocabulary: a presence verdict OR the page-level state
  // that overrides it. The brief calls the same thing `presence` because it
  // carries the raw verdict, not the resolved one.
  state: z.string(),
  limitations: z.array(z.string()),
});

/** Full projection of one cited page (`GET .../source-pages/{url_hash}`). */
export const sourcePageDetailSchema = responseObject({
  id: uuid(),
  canonical_url: z.string(),
  registrable_domain: z.string(),
  source_class: z.string().nullable(),
  page_format: z.string(),
  page_format_method: z.string().nullable(),
  inspection_state: z.string(),
  inspection_reason: z.string().nullable(),
  last_inspected_at: z.string().nullable(),
  last_cited_at: z.string().nullable(),
  // A scheduling value for inspection admission, never a citation count.
  recurrence_count: z.number().int(),
  title: z.string(),
  extracted_chars: z.number().int(),
  entities: z.array(sourcePageEntitySchema),
  limitations: z.array(z.string()),
});

/** The answer to an explicit inspect command — including a refusal. */
export const sourcePageInspectionSchema = responseObject({
  accepted: z.boolean(),
  reason: z.string().nullable(),
  budget_remaining: z.number().int(),
});

/**
 * One page where rivals appear and the brand does not.
 *
 * Every page here was READ — a gap needs a brand verdict, which only an
 * inspected page has — so this shape carries no inspection state. What was NOT
 * read is counted on the group beside it.
 */
export const competitorPageSchema = responseObject({
  url_hash: z.string(),
  canonical_url: z.string(),
  registrable_domain: z.string(),
  page_format: z.string(),
  title: z.string(),
  extracted_chars: z.number().int(),
  // Distinct analyzed answers in this project that cited the page.
  answers_citing: z.number().int(),
  brand_state: z.string(),
  brand_match_method: z.string().nullable(),
  // Found ON the page, each with the line proving it. Never the looser set of
  // competitors merely named in an answer that cited this page.
  competitors: z.array(sourcePageEntitySchema),
  opportunity_id: uuid().nullable(),
  opportunity_title: z.string().nullable(),
  limitations: z.array(z.string()),
});

export const sourceClassGroupSchema = responseObject({
  source_class: z.string(),
  pages_total: z.number().int(),
  pages_inspected: z.number().int(),
  // Counted, never folded into `pages`. An unread page is not a gap.
  pages_not_inspected: z.number().int(),
  pages_blocked: z.number().int(),
  gap_pages: z.number().int(),
  pages: z.array(competitorPageSchema),
  truncated: z.boolean(),
});

export const competitorAnalysisSchema = responseObject({
  pages_total: z.number().int(),
  pages_inspected: z.number().int(),
  pages_not_inspected: z.number().int(),
  gap_pages: z.number().int(),
  groups: z.array(sourceClassGroupSchema),
  limitations: z.array(z.string()),
  truncated: z.boolean(),
});
