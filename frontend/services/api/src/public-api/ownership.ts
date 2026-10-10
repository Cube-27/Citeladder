/**
 * Public paths nest every resource under `/v1/projects/{project_id}`. The
 * browser owners scope a prompt, topic, audit, action or crawl by workspace
 * only, so a public request first proves each such path ID belongs to the
 * path's project: a key restricted to one project can never reach another
 * project's rows through an ID it learned elsewhere.
 */
import type { Database } from '../db/database.ts';
import { notFound } from '../errors.ts';
import { parseUuid } from '../http/uuid.ts';

type Owner = {
  resource: string;
  project: (db: Database, workspaceId: string, id: string) => Promise<string | undefined>;
};

const OWNERS: Readonly<Record<string, Owner>> = {
  prompt_set_id: {
    resource: 'Prompt set',
    project: async (db, workspaceId, id) =>
      (
        await db
          .selectFrom('prompt_sets')
          .innerJoin('projects', 'projects.id', 'prompt_sets.project_id')
          .select('prompt_sets.project_id')
          .where('prompt_sets.id', '=', id)
          .where('projects.workspace_id', '=', workspaceId)
          .executeTakeFirst()
      )?.project_id,
  },
  prompt_id: {
    resource: 'Prompt',
    project: async (db, workspaceId, id) =>
      (
        await db
          .selectFrom('prompts')
          .innerJoin('prompt_sets', 'prompt_sets.id', 'prompts.prompt_set_id')
          .innerJoin('projects', 'projects.id', 'prompt_sets.project_id')
          .select('prompt_sets.project_id')
          .where('prompts.id', '=', id)
          .where('projects.workspace_id', '=', workspaceId)
          .executeTakeFirst()
      )?.project_id,
  },
  topic_id: {
    resource: 'Topic',
    project: async (db, workspaceId, id) =>
      (
        await db
          .selectFrom('topics')
          .innerJoin('projects', 'projects.id', 'topics.project_id')
          .select('topics.project_id')
          .where('topics.id', '=', id)
          .where('projects.workspace_id', '=', workspaceId)
          .executeTakeFirst()
      )?.project_id,
  },
  audit_id: {
    resource: 'Audit',
    project: async (db, workspaceId, id) =>
      (
        await db
          .selectFrom('audits')
          .select('project_id')
          .where('id', '=', id)
          .where('workspace_id', '=', workspaceId)
          .executeTakeFirst()
      )?.project_id,
  },
  action_id: {
    resource: 'Action',
    project: async (db, workspaceId, id) =>
      (
        await db
          .selectFrom('actions')
          .select('project_id')
          .where('id', '=', id)
          .where('workspace_id', '=', workspaceId)
          .executeTakeFirst()
      )?.project_id,
  },
  crawl_id: {
    resource: 'Crawl',
    project: async (db, workspaceId, id) =>
      (
        await db
          .selectFrom('site_crawls')
          .select('project_id')
          .where('id', '=', id)
          .where('workspace_id', '=', workspaceId)
          .executeTakeFirst()
      )?.project_id,
  },
};

/** 404 unless every owned path ID belongs to `projectId`. */
export async function requirePathOwnership(
  db: Database,
  workspaceId: string,
  projectId: string,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [name, raw] of Object.entries(params)) {
    const owner = Object.hasOwn(OWNERS, name) ? OWNERS[name] : undefined;
    if (owner === undefined) continue;
    const id = parseUuid(raw);
    // A malformed ID is the route's own 422; only a well-formed one is resolved.
    if (id === null) continue;
    if ((await owner.project(db, workspaceId, id)) !== projectId) throw notFound(owner.resource);
  }
}
