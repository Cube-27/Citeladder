import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// ---------------------------------------------------------------------------
// Fact-checking (gated pilot): user-owned brand facts, and the verdicts on the
// factual claims answers make about the brand. Projections over persisted
// `answer_claims` / `claim_verdicts`; missing data is a state, never a zero.
// ---------------------------------------------------------------------------

export const factTopicSchema = z.enum([
  'pricing',
  'plans',
  'integrations',
  'availability',
  'markets',
  'policies',
  'specs',
  'company',
]);
// Only `confirmed` facts are checked against; `retired` keeps the history.
export const factStatusSchema = z.enum(['draft', 'confirmed', 'retired']);

export const brandFactSchema = responseObject({
  id: uuid(),
  topic: factTopicSchema,
  statement: z.string(),
  source_url: z.string().nullable(),
  status: factStatusSchema,
  // Increments on every change; an edit must name the revision it read.
  revision: z.number().int(),
  updated_at: z.string(),
});

// `enabled` is false for a workspace outside the fact-checking pilot; the
// list is then empty and writes are refused.
export const brandFactListSchema = responseObject({
  enabled: z.boolean(),
  facts: z.array(brandFactSchema),
  // The bounds the API enforces on the fact form and CSV import.
  limits: responseObject({
    statement_max_chars: z.number().int(),
    facts_import_max_rows: z.number().int(),
  }),
});

// A claim's verdict against the confirmed facts frozen when its run started.
export const claimVerdictSchema = z.enum([
  'supported',
  'contradicted',
  'inconclusive',
  'not_covered',
]);

// Why a claim has no verdict. `model_omitted` is a claim the checker was sent
// but left out of its answer; `model_changed` is a deployment model other than
// the one the audit froze, so the answer was not read.
export const claimUnavailableReasonSchema = z.enum([
  'model_not_configured',
  'platform_cap',
  'invalid_output',
  'model_error',
  'task_failed',
  'model_omitted',
  'model_changed',
]);

// `value`: at least one verdict. `not_enabled`: the workspace is outside the
// pilot. `no_facts`: no selected run had confirmed facts when it started.
// `no_claims`: answers named the brand without a checkable factual claim.
// `pending`: claims are waiting for extraction or verification.
// `unavailable`: nothing could be checked (see `reason`).
const accuracyStateSchema = z.enum([
  'value',
  'not_enabled',
  'no_facts',
  'no_claims',
  'pending',
  'unavailable',
]);

// Every extracted brand claim lands in exactly one bucket.
export const accuracyCoverageSchema = responseObject({
  claims: z.number().int(),
  supported: z.number().int(),
  contradicted: z.number().int(),
  inconclusive: z.number().int(),
  not_covered: z.number().int(),
  // Claims or verdicts below the confidence floor; never counted as verdicts.
  low_confidence: z.number().int(),
  pending: z.number().int(),
  unavailable: z.array(
    responseObject({ reason: claimUnavailableReasonSchema, count: z.number().int() }),
  ),
  // Answers naming the brand whose claims are not extracted yet, or could not be.
  answers_pending: z.number().int(),
  answers_unavailable: z.number().int(),
  // Claims whose newest verdict override differs from the model's verdict; their
  // bucket above is the person's verdict (AV-12).
  edited: z.number().int(),
});

// supported ÷ (supported + contradicted); null when neither occurred.
export const accuracyScoreSchema = responseObject({
  accuracy: z.number().nullable(),
  coverage: accuracyCoverageSchema,
});

const accuracyBreakdownSchema = responseObject({
  key: z.string(),
  label: z.string(),
  score: accuracyScoreSchema,
});

const factReferenceSchema = responseObject({
  topic: factTopicSchema,
  statement: z.string(),
  source_url: z.string().nullable(),
});

// One claim an answer made about the brand: its quote is an exact substring
// of the answer, and `facts` are the frozen fact revisions the verdict cites.
export const accuracyClaimSchema = responseObject({
  claim: z.string(),
  topic: factTopicSchema,
  quote: z.string(),
  status: z.enum(['verdict', 'low_confidence', 'pending', 'unavailable']),
  verdict: claimVerdictSchema.nullable(),
  reason: claimUnavailableReasonSchema.nullable(),
  facts: z.array(factReferenceSchema),
  logical_engine: z.string(),
  prompt: z.string(),
  // Link target: `/runs/{run_id}?execution={execution_id}`.
  run_id: uuid(),
  execution_id: uuid(),
  observed_at: z.string(),
  // The claim's verdict row: the target of a verdict override. Null when the
  // claim was never verified (no fact on its topic, low confidence, pending).
  verdict_id: uuid().nullable(),
  // The newest override when it differs from the model; `verdict` is then the person's.
  edited: z
    .object({ model_verdict: claimVerdictSchema, note: z.string().nullable(), at: z.string() })
    .nullable(),
});

// The verdicts a person may give a claim; `not_covered` stays the checker's own finding.
export const overrideVerdictSchema = z.enum(['supported', 'contradicted', 'inconclusive']);

// URLs cited in answers that carry a contradicted claim: cited alongside the
// claim, never shown to be its source.
const accuracyCitedSchema = responseObject({
  domain: z.string(),
  answers: z.number().int(),
  example_url: z.string().nullable(),
});

const accuracyTrendPointSchema = responseObject({
  audit_id: uuid(),
  completed_at: z.string(),
  score: accuracyScoreSchema,
  // False when the templates, metrics version or fact set differ from the previous point's.
  comparable: z.boolean(),
});

export const accuracyResponseSchema = responseObject({
  state: accuracyStateSchema,
  reason: claimUnavailableReasonSchema.nullable(),
  source_audit_ids: z.array(uuid()),
  score: accuracyScoreSchema,
  topics: z.array(accuracyBreakdownSchema),
  engines: z.array(accuracyBreakdownSchema),
  contradicted: z.array(accuracyClaimSchema),
  cited_alongside: z.array(accuracyCitedSchema),
  trend: z.array(accuracyTrendPointSchema),
});

// The verdicts citing one frozen fact revision. `not_raised`: no checked claim
// in the selection cited it, which is not a count of zero; `pending`: none has
// yet, but claims are still being checked.
const factClaimCountsSchema = z.discriminatedUnion('kind', [
  responseObject({
    kind: z.literal('raised'),
    claims: z.number().int(),
    supported: z.number().int(),
    contradicted: z.number().int(),
    inconclusive: z.number().int(),
    last_raised_at: z.string(),
  }),
  responseObject({ kind: z.literal('not_raised') }),
  responseObject({ kind: z.literal('pending') }),
]);

// A fact revision as the selected runs froze it, with the verdicts citing it.
export const accuracyFactSchema = responseObject({
  revision_id: uuid(),
  fact_id: uuid(),
  revision: z.number().int(),
  topic: factTopicSchema,
  statement: z.string(),
  counts: factClaimCountsSchema,
});

// `enabled` is false outside the fact-checking pilot; `facts` is then empty.
export const accuracyFactListSchema = responseObject({
  enabled: z.boolean(),
  facts: z.array(accuracyFactSchema),
});

export const accuracyClaimPageSchema = responseObject({
  items: z.array(accuracyClaimSchema),
  next_cursor: z.string().nullable(),
});

// The brand claims of one execution, with offsets for highlighting.
export const executionClaimSchema = accuracyClaimSchema
  .omit({
    logical_engine: true,
    prompt: true,
    run_id: true,
    execution_id: true,
    observed_at: true,
    verdict_id: true,
    edited: true,
  })
  .extend({
    // Code-point offsets into the answer text.
    start: z.number().int(),
    end: z.number().int(),
  });

// An appended verdict override: the model's verdict stays as it was.
export const verdictOverrideSchema = responseObject({
  verdict_id: uuid(),
  model_verdict: claimVerdictSchema,
  verdict: overrideVerdictSchema,
  note: z.string().nullable(),
  at: z.string(),
});

// One imported CSV row's outcome, by its position in the request. Imported
// facts are drafts: never checked against until a person confirms them.
export const brandFactImportResultSchema = responseObject({
  rows: z.array(
    z.discriminatedUnion('kind', [
      responseObject({ index: z.number().int(), kind: z.literal('created'), fact_id: uuid() }),
      responseObject({ index: z.number().int(), kind: z.literal('duplicate') }),
      responseObject({ index: z.number().int(), kind: z.literal('invalid'), message: z.string() }),
    ]),
  ),
});

export type FactTopic = z.infer<typeof factTopicSchema>;
export type FactStatus = z.infer<typeof factStatusSchema>;
export type BrandFact = z.infer<typeof brandFactSchema>;
export type BrandFactList = z.infer<typeof brandFactListSchema>;
export type ClaimVerdict = z.infer<typeof claimVerdictSchema>;
export type AccuracyResponse = z.infer<typeof accuracyResponseSchema>;
export type AccuracyCoverage = z.infer<typeof accuracyCoverageSchema>;
export type AccuracyScore = z.infer<typeof accuracyScoreSchema>;
export type AccuracyClaim = z.infer<typeof accuracyClaimSchema>;
export type AccuracyFact = z.infer<typeof accuracyFactSchema>;
export type AccuracyFactList = z.infer<typeof accuracyFactListSchema>;
export type ExecutionClaim = z.infer<typeof executionClaimSchema>;
export type AccuracyClaimPage = z.infer<typeof accuracyClaimPageSchema>;
export type OverrideVerdict = z.infer<typeof overrideVerdictSchema>;
export type VerdictOverride = z.infer<typeof verdictOverrideSchema>;
export type BrandFactImportResult = z.infer<typeof brandFactImportResultSchema>;
