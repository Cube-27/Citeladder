import { randomUUID } from 'node:crypto';

import type { ProjectTheme } from '@citeladder/contracts/project';
import { projectThemeRequestSchema } from '@citeladder/contracts/project-requests';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';

import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { isUniqueViolation } from '../db/errors.ts';
import { ApiError, notFound } from '../errors.ts';
import type { DB } from '../generated/db-schema.ts';
import type { ProjectScope } from './brand-profile.ts';

const limits = policy.perception.project_themes;

export const cleanName = (name: string) => name.replaceAll(/\s+/gu, ' ').trim();
export const nameKey = (name: string) => cleanName(name).toLowerCase();
export const idsByName = (rows: readonly { id: string; name: string }[]) =>
  new Map(rows.map((row) => [nameKey(row.name), row.id]));
export const nameSchema = (maxChars: number) =>
  z.string().transform(cleanName).pipe(z.string().min(1).max(maxChars));

export const themeRequest = projectThemeRequestSchema.extend({
  name: nameSchema(limits.name_max_chars).refine(
    (name) => name.toLowerCase() !== limits.fallback.toLowerCase(),
    {
      message: `${limits.fallback} is every project's fallback theme`,
    },
  ),
});
type ThemeRequest = z.infer<typeof themeRequest>;

const COLUMNS = ['id', 'name', 'source'] as const;

function view(row: { id: string; name: string; source: string }): ProjectTheme {
  return {
    id: row.id,
    name: row.name,
    source: z.enum(['research', 'user', 'model']).parse(row.source),
  };
}

async function writing<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error, 'uq_project_theme_name'))
      throw new ApiError(409, 'A theme with this name already exists');
    throw error;
  }
}

export async function listThemes(db: Kysely<DB>, scope: ProjectScope): Promise<ProjectTheme[]> {
  const rows = await db
    .selectFrom('project_themes')
    .select(COLUMNS)
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('position')
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map(view);
}

export async function mergeThemes(
  db: Database,
  scope: ProjectScope & { themeId: string; intoId: string },
) {
  if (scope.themeId === scope.intoId) throw new ApiError(400, 'Choose another theme to merge into');
  return inTransaction(db, async (trx) => {
    const themes = await trx
      .selectFrom('project_themes')
      .select(COLUMNS)
      .where('id', 'in', [scope.themeId, scope.intoId])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .orderBy('id')
      .forUpdate()
      .execute();
    const kept = themes.find((theme) => theme.id === scope.intoId);
    if (themes.length !== 2 || !kept) throw notFound('Theme');
    await sql`
      update entity_sentiments as es
      set aspects = (
        select jsonb_agg(
          case when aspect->>'theme_id' = ${scope.themeId}
            then jsonb_set(aspect, '{theme_id}', to_jsonb(${scope.intoId}::text))
            else aspect end
          order by position)
        from jsonb_array_elements(es.aspects) with ordinality as item(aspect, position))
      from answer_perceptions as perception
      where perception.id = es.perception_id
        and perception.workspace_id = es.workspace_id
        and perception.workspace_id = ${scope.workspaceId}
        and perception.project_id = ${scope.projectId}
        and es.aspects @> ${JSON.stringify([{ theme_id: scope.themeId }])}::jsonb`.execute(trx);
    await trx
      .updateTable('probe_answer_items')
      .set({ theme_id: scope.intoId })
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('theme_id', '=', scope.themeId)
      .execute();
    await trx
      .deleteFrom('project_themes')
      .where('id', '=', scope.themeId)
      .where('workspace_id', '=', scope.workspaceId)
      .execute();
    return view(kept);
  });
}

export function createTheme(db: Database, scope: ProjectScope, input: ThemeRequest) {
  const now = new Date();
  return writing(async () =>
    view(
      await db
        .insertInto('project_themes')
        .values(({ selectFrom }) => ({
          id: randomUUID(),
          workspace_id: scope.workspaceId,
          project_id: scope.projectId,
          name: input.name,
          position: selectFrom('project_themes')
            .select(sql<number>`coalesce(max(position) + 1, 0)`.as('next'))
            .where('workspace_id', '=', scope.workspaceId)
            .where('project_id', '=', scope.projectId),
          source: 'user',
          created_at: now,
          updated_at: now,
        }))
        .returning(COLUMNS)
        .executeTakeFirstOrThrow(),
    ),
  );
}

export async function renameTheme(
  db: Database,
  scope: ProjectScope & { themeId: string },
  input: ThemeRequest,
) {
  const row = await writing(() =>
    db
      .updateTable('project_themes')
      .set({ name: input.name, updated_at: new Date() })
      .where('id', '=', scope.themeId)
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .returning(COLUMNS)
      .executeTakeFirst(),
  );
  if (!row) throw notFound('Theme');
  return view(row);
}

export async function deleteTheme(db: Database, scope: ProjectScope & { themeId: string }) {
  const result = await db
    .deleteFrom('project_themes')
    .where('id', '=', scope.themeId)
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .executeTakeFirst();
  if (!result.numDeletedRows) throw notFound('Theme');
}

export async function saveResearchThemes(
  trx: Kysely<DB>,
  scope: ProjectScope,
  names: readonly string[],
) {
  if (!names.length) return;
  const now = new Date();
  await trx
    .insertInto('project_themes')
    .values(
      names.map((name, position) => ({
        id: randomUUID(),
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        name,
        position,
        source: 'research',
        created_at: now,
        updated_at: now,
      })),
    )
    .execute();
}
