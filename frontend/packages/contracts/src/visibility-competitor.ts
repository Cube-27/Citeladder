import { z } from 'zod';

// ---------------------------------------------------------------------------
// One roster competitor against you over a selection (AV-6): projections over
// persisted answers, competitor mentions and citations. Counts are distinct
// answers; the competitor's own figures come from the ranking read.
// ---------------------------------------------------------------------------

// A domain cited in answers that name the competitor. `answers_naming_you`
// counts the selection's answers citing the domain that also name you:
// co-occurrence in an answer, never presence on the page.
const competitorSourceSchema = z.object({
  domain: z.string(),
  answers: z.number().int(),
  answers_naming_you: z.number().int(),
});

// A prompt where an answer names the competitor and not you. `engines` counts
// the engines with such an answer; `engines_answered` every engine that
// answered the prompt in the selection. A deleted prompt has no id.
const namedInsteadSchema = z.object({
  prompt_id: z.uuid().nullable(),
  prompt: z.string(),
  topic: z.string(),
  engines: z.number().int(),
  engines_answered: z.number().int(),
});

export const competitorFocusSchema = z.object({
  competitor: z.object({ id: z.uuid(), name: z.string() }),
  /** Answers in the selection that name the competitor. */
  answers: z.number().int(),
  sources: z.array(competitorSourceSchema),
  named_instead: z.array(namedInsteadSchema),
});

export type CompetitorFocus = z.infer<typeof competitorFocusSchema>;
