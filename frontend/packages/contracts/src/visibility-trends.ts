import { z } from 'zod';
import { modelProvenanceSchema } from './audits.ts';
import { measurementCountsSchema, rankingRowSchema } from './visibility.ts';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// ---------------------------------------------------------------------------
// Cross-run Visibility trend history (projection over persisted snapshots)
// ---------------------------------------------------------------------------

// Mention-level share of voice for one trend point, derived from the persisted
// `share_of_voice.mention_counts`; null when nobody was named.
const visibilityTrendSovSchema = responseObject({
  mention: z.number().nullable(),
});

// One brand-vs-competitor ranking-history row within a trend point (backend
// `VisibilityTrendRankingRow`). Field-for-field identical to `rankingRowSchema`
// — aliased so the two contracts can't drift apart silently.
const visibilityTrendRankingRowSchema = rankingRowSchema;

// What changed at a point, from persisted rows only: the frozen prompt panel or
// an engine's frozen model differs from the previous run's, or an Action went
// live since it. A bucket carries every event of the runs it folds.
export const visibilityTrendEventSchema = z.discriminatedUnion('kind', [
  responseObject({
    kind: z.literal('prompt_panel'),
    added: z.number().int(),
    archived: z.number().int(),
    removed: z.number().int(),
  }),
  responseObject({
    kind: z.literal('model_change'),
    logical_engine: z.string(),
    from_model: z.string(),
    to_model: z.string(),
  }),
  responseObject({
    kind: z.literal('action_live'),
    action_id: uuid(),
    title: z.string(),
    implemented_at: z.string(),
  }),
]);

// One point in the cross-run Visibility trend (backend `VisibilityTrendPoint`).
// A raw per-run point carries a set `audit_id`; a week/month bucket folds many
// snapshots (`audit_id` is null) and carries the full provenance list. Version
// metadata lists every distinct analyzer/scoring version the point folds, with
// `spans_version_boundary` set when a bucket mixes versions. `avg_position`
// folds by completions.
export const visibilityTrendPointSchema = responseObject({
  audit_id: uuid().nullable(),
  completed_at: z.string(),
  logical_engine: z.string().nullable(),
  visibility_score: z.number().nullable(),
  visibility_rate: z.number().nullable().optional(),
  prompt_performance_score: z.number().nullable().optional(),
  counts: measurementCountsSchema.optional(),
  comparison_key: z.string().nullable().optional(),
  run_count: z.number().int().optional(),
  source_audit_ids: z.array(uuid()).optional(),
  brand_mention_rate: z.number().nullable(),
  owned_citation_rate: z.number().nullable(),
  sov: visibilityTrendSovSchema,
  rankings: z.array(visibilityTrendRankingRowSchema),
  avg_position: z.number().nullable(),
  // Measurement identity partition (invariant 7): a point folds only inside
  // one (transport_model, retrieval_enabled) identity, so
  // the client must never recombine points across these. `transport_model` is
  // null when the point spans several models — see `model_provenance`.
  transport_model: z.string().nullable().default(null),
  retrieval_enabled: z.boolean().nullable().default(null),
  model_provenance: z.array(modelProvenanceSchema).default([]),
  // Provenance (invariant 4): every source snapshot this point folds.
  source_snapshot_ids: z.array(uuid()),
  // Distinct versions across the folded snapshots (invariant 4).
  analyzer_versions: z.array(z.string()),
  scoring_rule_versions: z.array(z.string()),
  spans_version_boundary: z.boolean(),
  events: z.array(visibilityTrendEventSchema).default([]),
});

// The trends endpoint returns a chronological list of points (never wrapped).
export const visibilityTrendListSchema = z.array(visibilityTrendPointSchema);
export type VisibilityTrendPoint = z.infer<typeof visibilityTrendPointSchema>;
export type VisibilityTrendEvent = z.infer<typeof visibilityTrendEventSchema>;
