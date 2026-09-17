import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);

// ---------------------------------------------------------------------------
// The entity-presence shape an inspected page carries.
//
// Read today through the Opportunities verification payload rather than a page
// endpoint of its own. Every field is a persisted projection: the backend never
// fetches on a read, so a page nobody has inspected carries no entities at all
// — which is NOT an absence, and no surface may render it as one.
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
