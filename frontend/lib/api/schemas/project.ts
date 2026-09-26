import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// ---------------------------------------------------------------------------
// Brand / project / prompts
// ---------------------------------------------------------------------------

export const competitorSchema = responseObject({
  id: uuid(),
  name: z.string(),
  aliases: z.array(z.string()),
  domains: z.array(z.string()),
  logo_url: z.string().nullable().optional(),
});

// Intent enum. The B3 backend `normalize_intent` casefolds a free-text intent
// and normalizes any empty/unknown value to `''` ("unspecified"), so `''` is a
// valid on-the-wire value and must be accepted here (contract, not UI sugar).
export const promptIntentSchema = z.enum([
  '',
  'discovery',
  'comparison',
  'purchase',
  'service',
  'local',
]);

// Where in the buyer journey a generated prompt sits, and what the person
// wants from the answer. Empty for manual and imported prompts, which never
// went through the backend's buyer-query slot planner.
export const buyerStageSchema = z.enum([
  '',
  'awareness',
  'consideration',
  'decision',
  'implementation',
]);
export const promptIntentDetailSchema = z.enum([
  '',
  'learn',
  'solve',
  'compare',
  'recommend',
  'validate',
  'buy',
  'implement',
]);

// Prompt library lifecycle. Measurement still requires an explicit audit run
// or schedule; generated prompts do not need a second approval state.
export const promptStatusSchema = z.enum(['active', 'archived']);
export const promptCohortSchema = z.enum(['core', 'brand_diagnostic', 'comparison', 'commerce']);

// Backend `PromptResponse.theme` is a non-null string (empty when unset), so
// the wire value is always a string — never null.
export const promptSchema = responseObject({
  id: uuid(),
  prompt_set_id: uuid(),
  topic_id: uuid().nullable().optional(),
  text: z.string(),
  theme: z.string(),
  intent: promptIntentSchema,
  buyer_stage: buyerStageSchema.default(''),
  prompt_intent: promptIntentDetailSchema.default(''),
  cohort: promptCohortSchema,
  branded: z.boolean(),
  enabled: z.boolean(),
  status: promptStatusSchema,
  origin: z.enum(['manual', 'imported', 'generated']),
  // Provenance for AI-generated prompts (model identity, run id, hashes) —
  // never contains credentials. Null for manual/imported prompts.
  generation_evidence: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// A topical category grouping prompts within a project (first-class resource;
// counts are per-status projections for the topics rail).
export const topicSchema = responseObject({
  id: uuid(),
  project_id: uuid(),
  // One level of nesting: a subtopic names its top-level parent.
  parent_id: uuid().nullable().default(null),
  name: z.string(),
  description: z.string(),
  origin: z.enum(['manual', 'generated']),
  active_count: z.number().int(),
  proposed_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

// A generated prompt awaiting review. It is never audited, charged to prompt
// capacity or counted until a user accepts it.
export const promptCandidateSchema = responseObject({
  id: uuid(),
  run_id: uuid(),
  prompt_set_id: uuid(),
  topic_id: uuid().nullable().default(null),
  text: z.string(),
  intent: z.string().default(''),
  buyer_stage: buyerStageSchema.default(''),
  prompt_intent: promptIntentDetailSchema.default(''),
  cohort: promptCohortSchema,
  created_at: z.string(),
  expires_at: z.string(),
});

// `POST /prompt-sets/{id}/generate` result: staged candidates, the topics
// they belong to, and how many duplicates were dropped.
export const promptGenerateResponseSchema = responseObject({
  candidates: z.array(promptCandidateSchema),
  topics: z.array(topicSchema),
  dropped_duplicates: z.number().int(),
  // What was asked for. The plan can be smaller than the request when the
  // selected topics cannot support it, and saying so beats returning fewer
  // prompts with no explanation.
  requested_count: z.number().int().default(0),
});

// `POST /prompt-sets/{id}/candidates/review` result.
export const promptCandidateReviewResponseSchema = responseObject({
  accepted: z.array(promptSchema),
  rejected_count: z.number().int(),
  dropped_duplicates: z.number().int(),
  unavailable_count: z.number().int(),
});

// Business map: per-offering facts that ground generation. Entries carry
// provenance; a model suggestion stays `suggested` until a person confirms it.
export const businessMapEntrySchema = responseObject({
  value: z.string(),
  origin: z.enum(['manual', 'model']),
  review_state: z.enum(['suggested', 'confirmed']),
  reviewed_by: z.string().nullable().default(null),
  reviewed_at: z.string().nullable().default(null),
  // Model identity and time for a suggestion; empty for manual entries.
  source: z.record(z.string(), z.unknown()).default({}),
});

const businessMapExclusionSchema = responseObject({
  first: z.string(),
  second: z.string(),
});

export const offeringMapSchema = responseObject({
  offering: z.string(),
  attributes: z.array(businessMapEntrySchema),
  situations: z.array(businessMapEntrySchema),
  audiences: z.array(businessMapEntrySchema),
  exclusions: z.array(businessMapExclusionSchema),
});

export const businessMapSchema = responseObject({
  offerings: z.array(offeringMapSchema),
  available_offerings: z.array(z.string()),
});

export const brandProfileSourceSchema = z.enum(['manual', 'web_evidence', 'ai_suggested']);
export const brandProfileReviewStateSchema = z.enum(['unreviewed', 'confirmed', 'edited']);

const brandProfileFieldProvenanceSchema = responseObject({
  origin: brandProfileSourceSchema,
  review_state: brandProfileReviewStateSchema,
  reviewed_by: uuid().nullable(),
  reviewed_at: z.string().nullable(),
});

const brandProfileFieldSourcesSchema = responseObject({
  description: brandProfileFieldProvenanceSchema.nullable(),
  positioning: brandProfileFieldProvenanceSchema.nullable(),
  products_services: brandProfileFieldProvenanceSchema.nullable(),
  target_audience: brandProfileFieldProvenanceSchema.nullable(),
});

const brandProfileSourceArtifactsSchema = responseObject({
  description: uuid().nullable(),
  positioning: uuid().nullable(),
  products_services: uuid().nullable(),
  target_audience: uuid().nullable(),
});

export const brandProfileDraftSchema = responseObject({
  description: z.string(),
  positioning: z.string(),
  products_services: z.array(z.string()),
  target_audience: z.string(),
});

export const brandProfileSchema = responseObject({
  id: uuid(),
  workspace_id: uuid(),
  project_id: uuid(),
  brand_id: uuid(),
  ...brandProfileDraftSchema.shape,
  sources: brandProfileFieldSourcesSchema,
  source_artifact_ids: brandProfileSourceArtifactsSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const promptSetSchema = responseObject({
  id: uuid(),
  project_id: uuid(),
  name: z.string(),
  // B3 PromptSetResponse carries a description and a denormalized prompt_count.
  description: z.string().optional(),
  prompt_count: z.number().int().optional(),
  prompts: z.array(promptSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const benchmarkModeSchema = z.enum([
  'consumer_like',
  'controlled_localized',
  'forced_grounded',
]);

export const projectSchema = responseObject({
  id: uuid(),
  workspace_id: uuid(),
  name: z.string(),
  brand_name: z.string(),
  website_url: z.string(),
  industry: z.string(),
  subindustry: z.string(),
  primary_market: z.string(),
  country_code: z.string(),
  language_code: z.string(),
  benchmark_mode: benchmarkModeSchema,
  default_repetitions: z.number().int(),
  brand: responseObject({
    aliases: z.array(z.string()),
    logo_url: z.string().nullable().optional(),
  }),
  owned_domains: z.array(z.string()),
  unintended_domains: z.array(z.string()),
  competitors: z.array(competitorSchema),
  prompt_sets: z.array(promptSetSchema),
  created_at: z.string(),
  updated_at: z.string(),
});
