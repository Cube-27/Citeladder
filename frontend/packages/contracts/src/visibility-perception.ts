import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// ---------------------------------------------------------------------------
// Answer perception (sentiment, themes, recommended rate) — projections over
// persisted `answer_perceptions` / `entity_sentiments` and the deterministic
// entity assessments. Missing data is a state, never a zero.
// ---------------------------------------------------------------------------

export const perceptionLabelSchema = z.enum([
  'positive',
  'neutral',
  'negative',
  'mixed',
  'not_assessable',
]);
const perceptionPolaritySchema = z.enum(['positive', 'negative']);

// Why a mention has no usable label. `platform_cap` and `model_not_configured`
// are bounded platform outcomes; `task_failed` is a worker that gave up;
// `entity_limit` is a business beyond the per-answer classification cap;
// `model_omitted` a business the classifier was sent but left out of its
// answer; `model_changed` a deployment model other than the one the audit froze.
const perceptionUnavailableReasonSchema = z.enum([
  'model_not_configured',
  'platform_cap',
  'entity_limit',
  'invalid_output',
  'model_error',
  'task_failed',
  'not_assessable',
  'model_omitted',
  'model_changed',
]);

// `value`: at least one confident label. `pending`: mentions are waiting for
// classification. `unavailable`: nothing classifiable (see `reason`).
// `no_mentions`: no completed answer in the selection named the brand.
const perceptionStateSchema = z.enum(['value', 'pending', 'unavailable', 'no_mentions']);

// "N of M mentions classified": every mention lands in exactly one bucket.
export const perceptionCoverageSchema = responseObject({
  mentions: z.number().int().describe('Mentions in the selection; each lands in one bucket below.'),
  classified: z.number().int().describe('Labelled with enough confidence to count.'),
  pending: z.number().int().describe('Waiting for classification.'),
  not_assessable: z.number().int().describe('Read, but carrying no tone to judge.'),
  low_confidence: z.number().int().describe('Labelled below the confidence floor: not counted.'),
  unavailable: z
    .array(responseObject({ reason: perceptionUnavailableReasonSchema, count: z.number().int() }))
    .describe('Mentions that could not be classified, by reason.'),
});

const SHARE_OF_CLASSIFIED = 'over `classified`, 0–1. Null: nothing classified.';
// `mixed` counts only in the denominator.
export const perceptionScoreSchema = responseObject({
  positive: z.number().int(),
  neutral: z.number().int(),
  negative: z.number().int(),
  mixed: z.number().int(),
  classified: z.number().int().describe('All four labels together: the denominator.'),
  positive_share: z.number().nullable().describe(`\`positive\` ${SHARE_OF_CLASSIFIED}`),
  negative_share: z.number().nullable().describe(`\`negative\` ${SHARE_OF_CLASSIFIED}`),
  net_sentiment: z
    .number()
    .nullable()
    .describe('(positive − negative) / classified × 100, −100 to 100. Null: nothing classified.'),
});

export const perceptionEntitySchema = responseObject({
  name: z.string(),
  is_brand: z.boolean(),
  score: perceptionScoreSchema,
  coverage: perceptionCoverageSchema,
  // Counts only: quotes stay the brand's own (AV-6).
  theme_mentions: z
    .array(responseObject({ theme: z.string(), mentions: z.number().int() }))
    .describe('Per theme, the classified mentions raising it at least once.'),
});

export const perceptionBreakdownSchema = responseObject({
  key: z.string().describe('The engine, topic or prompt this row covers.'),
  label: z.string(),
  score: perceptionScoreSchema,
  coverage: perceptionCoverageSchema,
});

// A verified quote: an exact substring of the answer passage it came from.
export const perceptionQuoteSchema = responseObject({
  text: z.string(),
  theme: z.string(),
  polarity: perceptionPolaritySchema,
  entity: z.string(),
  is_brand: z.boolean(),
  logical_engine: z.string(),
  prompt: z.string(),
  // Link target: `/runs/{run_id}?execution={execution_id}`.
  run_id: uuid(),
  execution_id: uuid(),
  observed_at: z.string(),
  // The versions that produced this quote (frozen at the run's admission).
  extractor_version: z.string(),
  template_version: z.string(),
});

const perceptionThemeSchema = responseObject({
  theme: z.string(),
  positive: z.number().int(),
  negative: z.number().int(),
  quotes: z.array(perceptionQuoteSchema),
});

// Sources cited in answers where the brand drew a negative aspect. These are
// cited alongside the criticism, never shown to have caused it.
const perceptionDriverSchema = responseObject({
  domain: z.string(),
  answers: z
    .number()
    .int()
    .describe('Answers with a negative aspect of the brand that cited it: alongside, not a cause.'),
  example_url: z.string().nullable(),
});

// Deterministic first-mention recommendation reading (English phrasing only).
const perceptionRecommendedSchema = responseObject({
  mentioned: z.number().int().describe('Answers that named the brand.'),
  recommended: z.number().int(),
  recommended_against: z.number().int(),
  rate: z.number().nullable().describe('`recommended` / `mentioned`, 0–1. Null: no mention.'),
  limitation: z.string(),
});

const perceptionTrendPointSchema = responseObject({
  audit_id: uuid(),
  completed_at: z.string(),
  score: perceptionScoreSchema,
  mentions: z.number().int(),
  extractor_version: z.string(),
  template_version: z.string(),
  metrics_version: z.string(),
  comparable: z.boolean().describe("False when this point's versions differ from the previous."),
});

export const perceptionResponseSchema = responseObject({
  state: perceptionStateSchema.describe(
    '`value`: at least one confident label. `pending`: waiting for classification. `unavailable`: nothing classifiable (see `reason`). `no_mentions`: no answer named the brand.',
  ),
  reason: perceptionUnavailableReasonSchema.nullable(),
  source_audit_ids: z.array(uuid()).describe('The runs this read counts.'),
  brand: perceptionEntitySchema.nullable(),
  coverage: perceptionCoverageSchema,
  entities: z.array(perceptionEntitySchema).describe('The brand and each competitor named.'),
  engines: z.array(perceptionBreakdownSchema).describe("The brand's tone per engine."),
  topics: z.array(perceptionBreakdownSchema).describe("The brand's tone per topic."),
  prompts: z.array(perceptionBreakdownSchema).describe("The brand's tone per prompt."),
  themes: z.array(perceptionThemeSchema),
  negative_quotes: z.array(perceptionQuoteSchema),
  drivers: z
    .array(perceptionDriverSchema)
    .describe('Sources cited alongside negative aspects of the brand.'),
  recommended: perceptionRecommendedSchema,
  trend: z.array(perceptionTrendPointSchema),
});

export const perceptionQuotePageSchema = responseObject({
  items: z.array(perceptionQuoteSchema),
  next_cursor: z.string().nullable(),
});

// Per-entity perception on one execution's evidence.
export const executionPerceptionSchema = responseObject({
  entity: z.string(),
  is_brand: z.boolean(),
  state: z.enum(['classified', 'not_assessable', 'low_confidence', 'pending', 'unavailable']),
  reason: perceptionUnavailableReasonSchema.nullable(),
  label: perceptionLabelSchema.nullable(),
  confidence: z.number().nullable(),
  // The versions this answer is classified under (frozen at the run's admission).
  extractor_version: z.string(),
  template_version: z.string(),
  aspects: z.array(
    responseObject({
      theme: z.string(),
      polarity: perceptionPolaritySchema,
      quote: z.string(),
      // Code-point offsets into the answer text.
      start: z.number().int(),
      end: z.number().int(),
    }),
  ),
});

export type PerceptionResponse = z.infer<typeof perceptionResponseSchema>;
export type PerceptionQuote = z.infer<typeof perceptionQuoteSchema>;
export type PerceptionScore = z.infer<typeof perceptionScoreSchema>;
export type PerceptionCoverage = z.infer<typeof perceptionCoverageSchema>;
export type ExecutionPerception = z.infer<typeof executionPerceptionSchema>;
