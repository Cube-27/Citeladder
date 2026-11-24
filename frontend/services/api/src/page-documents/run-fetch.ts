import type { WorkerSettings } from '../config/analytics.ts';
import type { Database } from '../db/database.ts';
import type { Executor } from '../queue/executor.ts';
import { AnalyticsWorker } from '../workers/analytics-worker.ts';
import { pageFetchTask } from './fetch-task.ts';
import { chatPageFetch, PAGE_FETCH_KIND } from './keys.ts';
import { pageFetchView } from './reads.ts';

const interactiveFetch = pageFetchTask();

export async function runChatPageFetch(
  db: Database,
  settings: WorkerSettings,
  chat: { workspace_id: string; id: string },
  { executor = interactiveFetch, signal }: { executor?: Executor; signal?: AbortSignal } = {},
) {
  const task = await chatPageFetch(db, chat.workspace_id, chat.id);
  if (!task) return null;
  const worker = new AnalyticsWorker(db, settings, {
    taskScope: { workspaceId: chat.workspace_id, taskIds: [task.id] },
    executors: { [PAGE_FETCH_KIND]: executor },
    signal,
  });
  await worker.runOnce();
  return pageFetchView(db, chat);
}
