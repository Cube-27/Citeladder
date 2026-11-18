import { z } from 'zod';

import { netSentimentSchema } from './visibility.ts';

// The Insights performance matrix and top rankings (W6): your brand, or each
// tracked brand, across two of engine, topic, market and brand, read from the
// persisted metric blocks of each market's latest run in the selection. Topics
// are the topic each run froze (AV-5); position and win rate count only the
// tracked roster (AV-7).

export const matrixDimensionSchema = z.enum(['engine', 'topic', 'market', 'brand']);
export type MatrixDimension = z.infer<typeof matrixDimensionSchema>;

const answers = z.number().int();

const axesSchema = z.object({
  engine: z.array(z.object({ logical_engine: z.string(), answers })),
  // `renamed_from`: the name the run froze, when the topic has been renamed since.
  topic: z.array(
    z.object({
      topic_id: z.uuid(),
      name: z.string(),
      renamed_from: z.string().nullable(),
      answers,
    }),
  ),
  // `market_id` null is the project default market.
  market: z.array(z.object({ market_id: z.uuid().nullable(), label: z.string(), answers })),
  brand: z.array(
    z.object({
      name: z.string(),
      is_brand: z.boolean(),
      logo_url: z.string().nullable(),
      website_url: z.string().nullable(),
    }),
  ),
});

// A segment pair with no answers is `not_run`, never zero. A measured value is
// null when it does not apply: position when the brand was never named, win
// rate when no tracked business was, sentiment when the run was not perceived.
export const matrixCellSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('not_run') }),
  z.object({
    kind: z.literal('measured'),
    answers,
    mention_rate: z.number().nullable(),
    share_of_voice: z.number().nullable(),
    avg_position: z.number().nullable(),
    win_rate: z.number().nullable(),
    sentiment: netSentimentSchema.nullable(),
  }),
]);
export type MatrixCell = z.infer<typeof matrixCellSchema>;

// grid[i][j]: item i of the pair's first axis against item j of its second.
const grid = z.array(z.array(matrixCellSchema));

const leaderSchema = z.object({
  name: z.string(),
  is_brand: z.boolean(),
  mention_rate: z.number(),
});
// One list per axis item, at most five brands by mention rate; empty when not run.
const leaders = z.array(z.array(leaderSchema));

export const visibilityMatrixSchema = z.object({
  source_audit_ids: z.array(z.uuid()),
  axes: axesSchema,
  grids: z.object({
    engine_topic: grid,
    engine_market: grid,
    engine_brand: grid,
    topic_market: grid,
    topic_brand: grid,
    market_brand: grid,
  }),
  rankings: z.object({ engine: leaders, topic: leaders, market: leaders }),
});

export type VisibilityMatrix = z.infer<typeof visibilityMatrixSchema>;
export type MatrixAxes = VisibilityMatrix['axes'];
export type MatrixPair = keyof VisibilityMatrix['grids'];
