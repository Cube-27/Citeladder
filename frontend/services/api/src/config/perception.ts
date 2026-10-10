/** Answer perception policy: versions, caps, the closed theme list and the model templates. */
import { z } from 'zod';
import value from './perception.json' with { type: 'json' };
import { ConfigError } from './config-error.ts';

const positive = z.int().positive();
const version = z.string().trim().min(1).max(64);
const share = z.number().min(0).max(1);
const schema = z.strictObject({
  task_kind: z.literal('answer_perception'),
  extractor_version: version,
  template_version: version,
  metrics_version: version,
  min_confidence: share,
  max_entities: positive,
  max_passage_chars_per_entity: positive,
  max_aspects_per_entity: positive,
  max_quotes_per_theme: positive,
  max_negative_quotes: positive,
  max_drivers: positive,
  max_classifications_per_audit: positive,
  max_classifications_per_workspace_per_day: positive,
  max_attempts: positive,
  task_max_attempts: positive,
  quotes_default_limit: positive,
  quotes_max_limit: positive,
  labels: z.tuple([
    z.literal('positive'),
    z.literal('neutral'),
    z.literal('negative'),
    z.literal('mixed'),
    z.literal('not_assessable'),
  ]),
  themes: z.array(z.string().regex(/^[a-z_]+$/u)).min(2),
  eval_policy_version: version,
  eval_thresholds: z.strictObject({
    min_label_agreement: share,
    min_macro_f1: share,
    min_quote_validity: share,
    max_total_tokens_per_answer: positive,
  }),
  system_template: z.string().trim().min(1),
  user_template: z.string().trim().min(1),
});

function loadPerception(input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ConfigError('Invalid perception configuration: ' + result.error.message);
  const config = result.data;
  if (config.themes.at(-1) !== 'other' || new Set(config.themes).size !== config.themes.length)
    throw new ConfigError('Perception themes must be unique and end with the "other" fallback');
  if (config.quotes_default_limit > config.quotes_max_limit)
    throw new ConfigError('Perception quote default limit exceeds its maximum');
  for (const slot of ['{prompt}', '{language}', '{themes}', '{max_aspects}', '{entities}'])
    if (!config.user_template.includes(slot))
      throw new ConfigError(`Perception user template is missing ${slot}`);
  return config;
}

export const perception = loadPerception(value);
export type PerceptionPolicy = typeof perception;
