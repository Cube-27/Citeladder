/**
 * Public read shapes that compose existing owners: the project's prompts with
 * their latest measurement, and a prompt set's generation runs. Both read
 * persisted rows only.
 */
import { promptSchema } from '@citeladder/contracts/project';
import { z } from 'zod';

import type { Database } from '../db/database.ts';
import { listPromptSets } from '../prompts/prompt-sets.ts';
import { getPromptMetrics, type PromptMetricItem } from '../visibility/prompts.ts';
import { pageAfter } from './pagination.ts';

type Scope = { workspaceId: string; projectId: string };

/**
 * A prompt's latest completed brand run: `not_measured` until one includes it;
 * a measured rate is `null` when that run could not determine it.
 */
const latestMeasurementSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('measured'),
    audit_id: z.uuid(),
    mention_rate: z.number().nullable(),
    citation_rate: z.number().nullable(),
  }),
  z.object({ state: z.literal('not_measured') }),
]);
export const publicPromptSchema = promptSchema.extend({
  latest_measurement: latestMeasurementSchema,
});

export const generationRunSchema = z.object({
  id: z.uuid(),
  prompt_set_id: z.uuid(),
  generator_version: z.string(),
  created_at: z.string(),
});

export type PromptFilters = {
  promptSetId: string | null;
  topicId: string | null;
  status: string | null;
};

async function latestMetrics(db: Database, scope: Scope): Promise<Map<string, PromptMetricItem>> {
  const query = {
    auditId: null,
    auditIds: null,
    baselineAuditIds: null,
    logicalEngine: null,
    baselineId: null,
  };
  const cohorts = await Promise.all(
    ['core', 'comparison'].map((cohort) => getPromptMetrics(db, scope, { ...query, cohort })),
  );
  const byPrompt = new Map<string, PromptMetricItem>();
  for (const item of cohorts.flat()) if (item.prompt_id) byPrompt.set(item.prompt_id, item);
  return byPrompt;
}

export async function listPublicPrompts(
  db: Database,
  scope: Scope,
  filters: PromptFilters,
  page: { cursor: string | null; limit: number },
) {
  const sets = await listPromptSets(db, scope.workspaceId, scope.projectId);
  const prompts = sets
    .filter((set) => filters.promptSetId === null || set.id === filters.promptSetId)
    .flatMap((set) => set.prompts)
    .filter(
      (prompt) =>
        (filters.topicId === null || prompt.topic_id === filters.topicId) &&
        (filters.status === null || prompt.status === filters.status),
    );
  const paged = pageAfter(prompts, page.cursor, page.limit);
  const metrics = await latestMetrics(db, scope);
  return {
    next_cursor: paged.next_cursor,
    items: paged.items.map((prompt) => {
      const measured = metrics.get(prompt.id);
      return {
        ...prompt,
        latest_measurement: measured
          ? {
              state: 'measured' as const,
              audit_id: measured.audit_id,
              mention_rate: measured.visibility_rate ?? null,
              citation_rate: measured.owned_citation_rate ?? null,
            }
          : { state: 'not_measured' as const },
      };
    }),
  };
}

export async function listGenerationRuns(
  db: Database,
  workspaceId: string,
  promptSetId: string,
): Promise<z.input<typeof generationRunSchema>[]> {
  const rows = await db
    .selectFrom('prompt_generation_runs')
    .select(['id', 'prompt_set_id', 'generator_version', 'created_at'])
    .where('workspace_id', '=', workspaceId)
    .where('prompt_set_id', '=', promptSetId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  return rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() }));
}
