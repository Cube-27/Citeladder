import type { FactCheckPromptList } from '@citeladder/contracts/fact-checking';
import { factCheckPromptsRequestSchema } from '@citeladder/contracts/prompt-requests';
import { z } from 'zod';

import { inTransaction, type Database } from '../db/database.ts';
import { requireFlag } from '../entitlements/access.ts';
import type { ProjectScope } from '../projects/brand-profile.ts';
import { acquireProjectLock } from './locks.ts';
import { setPromptFactCheck } from './prompts.ts';

export async function listFactCheckPrompts(
  db: Database,
  scope: ProjectScope,
): Promise<FactCheckPromptList> {
  await requireFlag(db, scope.workspaceId, 'fact_checking');
  const rows = await db
    .selectFrom('prompts as p')
    .innerJoin('prompt_sets as s', 's.id', 'p.prompt_set_id')
    .leftJoin('topics as topic', (join) =>
      join.onRef('topic.id', '=', 'p.topic_id').onRef('topic.workspace_id', '=', 'p.workspace_id'),
    )
    .select(['p.id', 'p.text', 'topic.name as topic'])
    .select((eb) => eb.fn.coalesce('p.fact_check', 'p.branded').as('checked'))
    .where('p.workspace_id', '=', scope.workspaceId)
    .where('s.project_id', '=', scope.projectId)
    .where('p.enabled', '=', true)
    .where('p.status', '=', 'active')
    .orderBy('topic.name')
    .orderBy('p.created_at')
    .orderBy('p.id')
    .execute();
  return { prompts: rows };
}

export async function setFactCheckPrompts(
  db: Database,
  scope: ProjectScope,
  input: z.output<typeof factCheckPromptsRequestSchema>,
): Promise<FactCheckPromptList> {
  await inTransaction(db, async (trx) => {
    await acquireProjectLock(trx, scope.projectId);
    await requireFlag(trx, scope.workspaceId, 'fact_checking');
    await setPromptFactCheck(trx, scope, input.prompt_ids);
  });
  return listFactCheckPrompts(db, scope);
}
