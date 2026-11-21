import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';

const { project, prompt_set: promptSet } = policy.prompts.locks;

export async function acquireProjectLock(db: Database, projectId: string): Promise<void> {
  await advisoryXactLock(db, project, projectId);
}

export async function acquirePromptSetLock(db: Database, promptSetId: string): Promise<void> {
  await advisoryXactLock(db, promptSet, promptSetId);
}
