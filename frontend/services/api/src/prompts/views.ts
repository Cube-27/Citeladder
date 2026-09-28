/** Prompt-library rows as the shared `@citeladder/contracts/project` views. */
import {
  promptCandidateSchema,
  promptCohortSchema,
  promptIntentDetailSchema,
  promptIntentSchema,
  promptSchema,
  promptSetSchema,
  promptStatusSchema,
  buyerStageSchema,
  topicSchema,
} from '@citeladder/contracts/project';
import type { Selectable } from 'kysely';
import { z } from 'zod';

import { policy } from '../config.ts';
import { jsonObject, record, strings } from '../db/json.ts';
import type { PromptCandidates, Prompts, PromptSets, Topics } from '../generated/db-schema.ts';

export type PromptRow = Selectable<Prompts>;
export type PromptSetRow = Selectable<PromptSets>;
export type TopicRow = Selectable<Topics>;
export type CandidateRow = Selectable<PromptCandidates>;

export type PromptView = z.input<typeof promptSchema>;
export type PromptSetView = z.input<typeof promptSetSchema>;
export type TopicView = z.input<typeof topicSchema>;
export type CandidateView = z.input<typeof promptCandidateSchema>;

const promptOrigin = promptSchema.shape.origin;
const topicOrigin = topicSchema.shape.origin;
const [QUALITY_OFF, QUALITY_UNAVAILABLE] = policy.prompts.candidate.quality_gates_reported;

export function promptView(row: PromptRow): PromptView {
  return {
    id: row.id,
    prompt_set_id: row.prompt_set_id,
    topic_id: row.topic_id,
    text: row.text,
    theme: row.theme,
    intent: promptIntentSchema.parse(row.intent),
    buyer_stage: buyerStageSchema.parse(row.buyer_stage),
    prompt_intent: promptIntentDetailSchema.parse(row.prompt_intent),
    cohort: promptCohortSchema.parse(row.cohort),
    branded: row.branded,
    enabled: row.enabled,
    status: promptStatusSchema.parse(row.status),
    origin: promptOrigin.parse(row.origin),
    generation_evidence:
      row.generation_evidence === null
        ? null
        : jsonObject(row.generation_evidence, 'prompts.generation_evidence'),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function promptSetView(row: PromptSetRow, prompts: readonly PromptRow[]): PromptSetView {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description,
    prompts: prompts.map(promptView),
    prompt_count: prompts.length,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function topicView(row: TopicRow, activeCount: number): TopicView {
  return {
    id: row.id,
    project_id: row.project_id,
    parent_id: row.parent_id,
    name: row.name,
    description: row.description,
    origin: topicOrigin.parse(row.origin),
    active_count: activeCount,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** `judged`, the run's reported gate (`off`/`unavailable`), or `not_judged`. */
function qualityStatus(decision: Record<string, unknown>, runGate: string | null) {
  if (Object.keys(decision).length > 0) return 'judged' as const;
  if (runGate === QUALITY_OFF) return 'off' as const;
  if (runGate === QUALITY_UNAVAILABLE) return 'unavailable' as const;
  return 'not_judged' as const;
}

export function candidateView(row: CandidateRow, runGate: string | null): CandidateView {
  const decision = record(row.jev_decision);
  return {
    id: row.id,
    run_id: row.run_id,
    prompt_set_id: row.prompt_set_id,
    topic_id: row.topic_id,
    text: row.text,
    intent: row.intent,
    buyer_stage: buyerStageSchema.parse(row.buyer_stage),
    prompt_intent: promptIntentDetailSchema.parse(row.prompt_intent),
    cohort: promptCohortSchema.parse(row.cohort),
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    quality_status: qualityStatus(decision, runGate),
    quality_flags: strings(decision.flags),
  };
}
