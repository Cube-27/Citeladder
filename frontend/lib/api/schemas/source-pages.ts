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
