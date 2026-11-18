import { z } from 'zod';

import { winCountsSchema } from './visibility.ts';

// One topic of the "By topic" breakdown. Answers group by the topic their
// prompt had when its run froze it (AV-5), so `topic_id` names a topic across
// renames: `name` is its current name and `renamed_from` the other names the
// selected runs froze, newest first. A topic the selected runs never asked is
// `not_run`, never zero.
const topicIdentity = {
  topic_id: z.uuid(),
  name: z.string(),
  renamed_from: z.array(z.string()),
};

const visibilityTopicRowSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('not_run'), ...topicIdentity }),
  z.object({
    kind: z.literal('measured'),
    ...topicIdentity,
    answers: z.number().int(),
    visibility_rate: z.number().nullable(),
    share_of_voice: z.number().nullable(),
    avg_position: z.number().nullable(),
    // The brand's place among the tracked brands by share of voice; null when
    // no tracked brand was named.
    rank: z.number().int().nullable(),
    ranked_brands: z.number().int(),
    // The brand's win counts (AV-7) over the topic's answers; null before the derivation.
    ...winCountsSchema.shape,
  }),
]);

export const visibilityTopicsSchema = z.object({
  source_audit_ids: z.array(z.uuid()),
  items: z.array(visibilityTopicRowSchema),
});

export type VisibilityTopicRow = z.infer<typeof visibilityTopicRowSchema>;
export type VisibilityTopics = z.infer<typeof visibilityTopicsSchema>;
