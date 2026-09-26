/**
 * Prompt manual-entry form model (F7).
 *
 * A small zod schema + helpers used by the add/edit dialog. Kept separate from
 * the component so the mapping to the API payloads is unit-testable and the
 * dialog stays presentational. Users give only the prompt and its topic;
 * theme, intent and cohort are internal vocabulary with code defaults.
 */
import { z } from 'zod';

import type { PromptInput, PromptUpdateInput } from '@/lib/api/prompts';
import { promptIntentSchema } from '@/lib/api/schemas/project';
import type { Prompt, PromptIntent } from '@/lib/api/types';

export const promptFormSchema = z.object({
  text: z.string().trim().min(1, 'Prompt text is required.'),
  /** A topic id of the project, or '' for no topic. */
  topicId: z.string(),
});

export type PromptFormValues = z.infer<typeof promptFormSchema>;

/** Ordered intent options for the filter menu; '' renders as "Unspecified". */
export const intentValues: PromptIntent[] = promptIntentSchema.options;

export const intentLabels: Record<PromptIntent, string> = {
  '': 'Unspecified',
  discovery: 'Discovery',
  comparison: 'Comparison',
  purchase: 'Purchase',
  service: 'Service',
  local: 'Local',
};

/** Buyer-journey stage, shown beside intent for generated prompts. */
export const buyerStageLabels: Record<string, string> = {
  '': 'Unspecified',
  awareness: 'Awareness',
  consideration: 'Consideration',
  decision: 'Decision',
  implementation: 'Implementation',
};

/** A blank add form, filed under the topic the reader is looking at. */
export function emptyPromptForm(topicId: string | null = null): PromptFormValues {
  return { text: '', topicId: topicId ?? '' };
}

/** Prefill the form from an existing prompt (edit path). */
export function promptToFormValues(prompt: Prompt): PromptFormValues {
  return { text: prompt.text, topicId: prompt.topic_id ?? '' };
}

/** Create payload: everything the form does not ask for takes its default. */
export function formValuesToPromptInput(values: PromptFormValues): PromptInput {
  const text = values.text.trim();
  return values.topicId ? { text, topic_id: values.topicId } : { text };
}

/**
 * Update payload: only the fields the form edits, so a generated prompt keeps
 * its theme, intent, cohort and enabled state. An empty topic sends an
 * explicit null, which detaches the prompt from its topic.
 */
export function formValuesToPromptUpdate(values: PromptFormValues): PromptUpdateInput {
  return { text: values.text.trim(), topic_id: values.topicId || null };
}
