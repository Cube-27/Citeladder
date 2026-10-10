/** The perception model request: rendered templates and the structured output it must return. */
import { z } from 'zod';

import type { PerceptionPolicy } from '../config/perception.ts';
import type { PerceptionPackage } from './passages.ts';

export const LABELS = ['positive', 'neutral', 'negative', 'mixed', 'not_assessable'] as const;
export type Label = (typeof LABELS)[number];

// Lenient on counts and themes: the deterministic validator truncates and
// remaps them, so one extra aspect never discards a whole answer.
export const perceptionOutputSchema = z.object({
  entities: z.array(
    z.object({
      entity_id: z.string(),
      label: z.enum(LABELS),
      confidence: z.number().min(0).max(1),
      aspects: z.array(
        z.object({
          theme: z.string(),
          polarity: z.enum(['positive', 'negative']),
          quote: z.string(),
        }),
      ),
    }),
  ),
});
export type PerceptionOutput = z.infer<typeof perceptionOutputSchema>;

/** The system and user messages for one package. */
export function perceptionPrompt(
  pkg: PerceptionPackage,
  policy: Pick<
    PerceptionPolicy,
    'system_template' | 'user_template' | 'themes' | 'max_aspects_per_entity'
  >,
) {
  const entities = pkg.entities.map((entity) => ({
    entity_id: entity.entity_id,
    name: entity.name,
    kind: entity.kind,
    passages: entity.spans.map((span) => span.text),
  }));
  const slots: Record<string, string> = {
    '{prompt}': pkg.prompt,
    '{language}': pkg.language || 'unknown',
    '{themes}': policy.themes.join(', '),
    '{max_aspects}': String(policy.max_aspects_per_entity),
    '{entities}': JSON.stringify(entities, null, 2),
  };
  // One pass, so a slot-shaped string inside the answer is never re-substituted.
  const user = policy.user_template.replaceAll(
    /\{(?:prompt|language|themes|max_aspects|entities)\}/gu,
    (slot) => slots[slot]!,
  );
  return { system: policy.system_template, user };
}
