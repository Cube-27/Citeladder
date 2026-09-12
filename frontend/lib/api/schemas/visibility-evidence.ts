import { z } from 'zod';
import { citationSchema } from './audits';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// ---------------------------------------------------------------------------
// Execution-evidence projection (Mentions & Citations + Query Fanout tabs)
// `GET /projects/{id}/visibility/evidence`. A pure read projection over already
// persisted mention/citation/task/artifact rows — nothing is inferred or
// backfilled at read time (invariant 7).
// ---------------------------------------------------------------------------

// Three-state query-fanout availability for one execution (backend
// `VisibilityFanoutState`): `queries_available` (≥1 stored event has non-blank
// query text), `count_only` (search used / count positive but no query text —
// e.g. a legacy count-only row), `no_search` (neither signal present).
export const visibilityFanoutStateSchema = z.enum(['queries_available', 'count_only', 'no_search']);

// One normalized stored search event (backend `VisibilityEvidenceSearchEvent`).
// Empty query strings are preserved verbatim (a count-only event); query text
// is never invented.
export const visibilityEvidenceSearchEventSchema = responseObject({
  sequence: z.number().int(),
  query: z.string(),
  call_id: z.string(),
  call_sequence: z.number().int(),
  query_sequence: z.number().int(),
});

// One persisted brand/competitor mention row (backend
// `VisibilityMentionEvidence`). Projected directly from `BrandMention` /
// `CompetitorMention`; never inferred from answer text at read time.
export const visibilityMentionEvidenceSchema = responseObject({
  kind: z.enum(['brand', 'competitor']),
  name: z.string(),
  first_offset: z.number().int().nullable(),
  artifact_id: uuid().nullable(),
  analyzer_version: z.string(),
});

// One execution's persisted mention/citation + query-fanout evidence (backend
// `VisibilityExecutionEvidence`). `prompt_id` is nullable so a deleted source
// prompt stays readable via its frozen `prompt_text`; `completed_at` is
// nullable for an incomplete/legacy row.
export const visibilityExecutionEvidenceSchema = responseObject({
  audit_id: uuid(),
  task_id: uuid(),
  analysis_id: uuid(),
  artifact_id: uuid().nullable(),
  prompt_snapshot_id: uuid(),
  prompt_id: uuid().nullable(),
  prompt_index: z.number().int(),
  prompt_text: z.string(),
  repetition: z.number().int(),
  completed_at: z.string().nullable(),
  logical_engine: z.string(),
  transport_provider: z.string(),
  transport_model: z.string(),
  // Execution-level surface (singular model).
  retrieval_enabled: z.boolean().nullable().default(null),
  search_used: z.boolean(),
  search_query_count: z.number().int(),
  query_text_available: z.boolean(),
  state: visibilityFanoutStateSchema,
  search_events: z.array(visibilityEvidenceSearchEventSchema),
  event_source: z.enum(['raw_artifact', 'audit_task', 'none']),
  mentions: z.array(visibilityMentionEvidenceSchema),
  citations: z.array(citationSchema),
});

// The shared evidence dataset for the two evidence tabs (backend
// `VisibilityEvidenceResponse`). `items` is newest-first; `truncated` is set
// when more than `limit` matches exist (no offset/cursor/total).
export const visibilityEvidenceResponseSchema = responseObject({
  items: z.array(visibilityExecutionEvidenceSchema),
  truncated: z.boolean(),
  total: z.number().int().optional(),
  next_cursor: z.string().nullable().optional(),
  as_of: z.string().nullable().optional(),
  prompt_options: z.array(responseObject({ id: uuid(), label: z.string() })).optional(),
});

export const visibilitySourcesSchema = responseObject({
  total: z.number().int(),
  responses: z.number().int(),
  prompts: z.number().int(),
  // Distinct cited domains per source class across the WHOLE selection, so the
  // breakdown is not a picture of whichever page happens to be loaded.
  category_totals: z.record(z.string(), z.number().int()).optional(),
  next_offset: z.number().int().nullable(),
  as_of: z.string(),
  comparison_status: z.string(),
  items: z.array(
    responseObject({
      key: z.string(),
      responses: z.number().int(),
      prompts: z.number().int(),
      annotations: z.number().int(),
      urls: z.number().int(),
      response_rate: z.number().nullable(),
      prompt_coverage: z.number().nullable(),
      ownership: z.array(z.string()),
      categories: z.array(z.string()),
      taxonomy_versions: z.array(z.string()),
      category_unavailable: z.boolean(),
      response_delta: z.number().nullable(),
    }),
  ),
});

export const visibilityFanoutSummarySchema = responseObject({
  // Totals over the WHOLE selected run set: unaffected by paging or search.
  event_count: z.number().int(),
  distinct_queries: z.number().int(),
  // Query rows matching the current `search` (equal to `distinct_queries`
  // when no search is applied). What the table pages through.
  matched_queries: z.number().int(),
  coverage: z.record(z.string(), z.number().int()),
  next_offset: z.number().int().nullable(),
  total_answers: z.number().int(),
  answers: z.array(
    responseObject({
      audit_id: uuid(),
      task_id: uuid(),
      prompt_text: z.string(),
      logical_engine: z.string(),
      brand_mentioned: z.boolean(),
      owned_domain_cited: z.boolean(),
    }),
  ),
  items: z.array(
    responseObject({
      query: z.string(),
      event_count: z.number().int(),
      prompt_count: z.number().int(),
      engines: z.array(z.string()),
      response_count: z.number().int(),
      brand_response_count: z.number().int(),
    }),
  ),
});
