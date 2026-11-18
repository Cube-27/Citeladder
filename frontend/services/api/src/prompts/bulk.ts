/**
 * Bulk prompt changes across one project's sets: file a selection under a
 * topic, or delete it. Each runs in one transaction under the project lock
 * (then the prompt-set locks, in id order), and every id must be a prompt of
 * the project: one that is not refuses the whole request rather than being
 * skipped.
 */
import {
  promptBulkDeleteRequestSchema,
  promptBulkTopicRequestSchema,
} from '@citeladder/contracts/prompt-requests';
import { z } from 'zod';

import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { isNonEmpty } from '../lists.ts';
import type { ProjectScope } from '../projects/brand-profile.ts';
import { bindingError, bindingFailure, loadVocabulary } from './binding.ts';
import { acquireProjectLock, acquirePromptSetLock } from './locks.ts';
import { failures, scopedPrompts, topicText } from './prompts.ts';

const P = policy.prompts;
const ids = promptBulkDeleteRequestSchema.shape.prompt_ids.max(P.bulk_prompts_max);

export const promptBulkDelete = promptBulkDeleteRequestSchema.extend({ prompt_ids: ids });
export const promptBulkTopic = promptBulkTopicRequestSchema.extend({ prompt_ids: ids });

/**
 * File the prompts under `topic_id` (null: no topic). Past runs keep the topic
 * they froze. An active prompt that moves must bind to its new topic, as a
 * single re-file must; one that fails refuses the whole request.
 */
export async function assignPromptTopic(
  db: Database,
  scope: ProjectScope,
  input: z.infer<typeof promptBulkTopic>,
): Promise<{ count: number }> {
  const promptIds = [...new Set(input.prompt_ids)];
  return inTransaction(db, async (trx) => {
    await acquireProjectLock(trx, scope.projectId);
    const rows = await scopedPrompts(trx, scope, promptIds);
    const context = input.topic_id === null ? '' : await topicText(trx, scope, input.topic_id);
    const moved = rows.filter(
      (row) => row.status === P.status_active && row.topic_id !== input.topic_id,
    );
    if (isNonEmpty(moved)) {
      const vocabulary = await loadVocabulary(trx, scope);
      const failed = failures(moved, (row) => bindingFailure(row.text, vocabulary, context));
      if (isNonEmpty(failed))
        throw bindingError(
          failed[0].failure,
          `${failed.length} prompt(s) fail topical binding under this topic`,
          {
            prompts: failed.map(({ item, code, message }) => ({
              prompt_id: item.id,
              code,
              message,
            })),
          },
        );
    }
    await trx
      .updateTable('prompts')
      .set({ topic_id: input.topic_id, updated_at: new Date() })
      .where('workspace_id', '=', scope.workspaceId)
      .where('id', 'in', promptIds)
      .execute();
    return { count: promptIds.length };
  });
}

/** Delete the prompts at once. Their past runs and reports keep the answers. */
export async function deletePrompts(
  db: Database,
  scope: ProjectScope,
  input: z.infer<typeof promptBulkDelete>,
): Promise<{ count: number }> {
  const promptIds = [...new Set(input.prompt_ids)];
  return inTransaction(db, async (trx) => {
    await acquireProjectLock(trx, scope.projectId);
    const rows = await scopedPrompts(trx, scope, promptIds);
    for (const setId of [...new Set(rows.map((row) => row.prompt_set_id))].sort())
      await acquirePromptSetLock(trx, setId);
    const result = await trx
      .deleteFrom('prompts')
      .where('workspace_id', '=', scope.workspaceId)
      .where('id', 'in', promptIds)
      .executeTakeFirst();
    // A single delete takes no lock, so one can win the race; the rest roll back.
    if (Number(result.numDeletedRows) !== promptIds.length)
      throw new ApiError(404, 'Prompt(s) not found in this project');
    return { count: promptIds.length };
  });
}
