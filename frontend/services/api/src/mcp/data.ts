/** Live authorization for persisted MCP evidence. */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { parseUuid } from '../http/uuid.ts';
import { utcText } from '../db/timestamps.ts';
import { McpInputError, type EvidencePrincipal } from './types.ts';
import { mcpPolicy } from './config.ts';

/** Roles whose capabilities include reading workspace evidence. */
export const READ_ROLES = Object.entries(policy.workspaces.roles)
  .filter(([, caps]) => caps.includes('read'))
  .map(([role]) => role);

export async function authorizedWorkspaceIds(
  db: Database,
  principal: EvidencePrincipal,
): Promise<string[]> {
  if ('kind' in principal) {
    const member = await db
      .selectFrom('workspace_members as m')
      .innerJoin('workspaces as w', 'w.id', 'm.workspace_id')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select('m.workspace_id')
      .where('m.user_id', '=', principal.userId)
      .where('m.workspace_id', '=', principal.workspaceId)
      .where('m.role', 'in', READ_ROLES)
      .where('w.is_system', '=', false)
      .where('u.is_active', '=', true)
      .executeTakeFirst();
    return member ? [member.workspace_id] : [];
  }
  const rows = await db
    .selectFrom('workspace_members as member')
    .innerJoin('workspaces as workspace', 'workspace.id', 'member.workspace_id')
    .innerJoin('mcp_oauth_grants as g', 'g.user_id', 'member.user_id')
    .innerJoin('users as account', 'account.id', 'member.user_id')
    .select('member.workspace_id')
    .where('member.user_id', '=', principal.userId)
    .where('member.role', 'in', READ_ROLES)
    .where('workspace.is_system', '=', false)
    .where('account.is_active', '=', true)
    .where('g.id', '=', principal.grantId)
    .where('g.access_token_hash', '=', principal.tokenHash)
    .where('g.revoked_at', 'is', null)
    .where('g.access_expires_at', '>', sql<Date>`clock_timestamp()`)
    .where(sql<boolean>`g.workspace_ids @> jsonb_build_array(member.workspace_id::text)`)
    .execute();
  return rows.map((row) => row.workspace_id);
}
export async function authorizeProject(
  db: Database,
  principal: EvidencePrincipal,
  projectId: string,
) {
  const id = parseUuid(projectId);
  if (!id) throw new McpInputError('project_id must be a UUID');
  if ('kind' in principal && principal.projectId !== id)
    throw new McpInputError('Project is fixed by the caller');
  const workspaces = await authorizedWorkspaceIds(db, principal);
  const row = workspaces.length
    ? await db
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', id)
        .where('workspace_id', 'in', workspaces)
        .executeTakeFirst()
    : undefined;
  if (!row) throw new McpInputError('Project was not found in this account');
  return row;
}
export const encodeCursor = (...parts: unknown[]) =>
  Buffer.from(JSON.stringify(parts.map(String))).toString('base64url');
export function decodeCursor(value: string, size: number): string[] {
  try {
    const parts: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      !Array.isArray(parts) ||
      parts.length !== size ||
      parts.some((part) => typeof part !== 'string')
    )
      throw new Error('cursor shape');
    return parts as string[];
  } catch {
    throw new McpInputError('cursor is invalid');
  }
}
export const pagination = (
  items: unknown[],
  cursor: string | null,
  total: number | null = null,
) => ({
  returned_count: items.length,
  has_more: cursor !== null,
  next_cursor: cursor,
  total_count: total,
});
export async function listAccountProjects(
  db: Database,
  principal: EvidencePrincipal,
  limit: number,
  cursor: string | null,
) {
  const workspaces = await authorizedWorkspaceIds(db, principal);
  if (!workspaces.length)
    return { scope: 'account', projects: [], pagination: pagination([], null) };
  let query = db
    .selectFrom('projects as p')
    .innerJoin('workspaces as w', 'w.id', 'p.workspace_id')
    .select([
      'p.id',
      'p.workspace_id',
      'w.name as workspace_name',
      'p.name',
      'p.brand_name',
      'p.website_url',
      'p.industry',
      'p.primary_market',
    ])
    .select(utcText(sql.ref('p.created_at')).as('cursor_at'))
    .where('p.workspace_id', 'in', workspaces);
  if ('kind' in principal) query = query.where('p.id', '=', principal.projectId);
  if (cursor) {
    const [at, id] = decodeCursor(cursor, 2);
    if (!parseUuid(id) || !at || Number.isNaN(Date.parse(at)))
      throw new McpInputError('cursor is invalid');
    query = query.where(sql<boolean>`(p.created_at, p.id) > (${at}::timestamptz, ${id}::uuid)`);
  }
  const rows = await query
    .orderBy('p.created_at')
    .orderBy('p.id')
    .limit(limit + 1)
    .execute();
  const selected = rows.slice(0, limit),
    last = selected.at(-1);
  const projects = selected.map(({ cursor_at: _at, ...row }) => row);
  return {
    scope: 'account',
    projects,
    pagination: pagination(
      projects,
      rows.length > limit && last ? encodeCursor(last.cursor_at, last.id) : null,
    ),
  };
}
export async function searchBusinessContext(
  db: Database,
  principal: EvidencePrincipal,
  query: string,
  projectId: string | null,
  limit: number,
  origin: string,
) {
  if ('kind' in principal) {
    if (projectId && projectId !== principal.projectId)
      throw new McpInputError('Project is fixed by the caller');
    projectId = principal.projectId;
  }
  const normalized = query.trim();
  if (!normalized) throw new McpInputError('query must not be empty');
  if (projectId) await authorizeProject(db, principal, projectId);
  const workspaces = await authorizedWorkspaceIds(db, principal),
    results: Record<string, string>[] = [];
  const pattern = `%${normalized
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('%', String.raw`\%`)
    .replaceAll('_', String.raw`\_`)}%`;
  const append = (kind: string, id: string, title: string, text: string) => {
    const uri = `citeladder://${kind}/${id}`;
    results.push({
      id: uri,
      type: kind,
      title,
      text: text.slice(0, mcpPolicy.search_snippet_chars),
      url: `${origin}/dashboard?record=${encodeURIComponent(uri)}`,
    });
  };
  if (workspaces.length) {
    let projects = db
      .selectFrom('projects')
      .select(['id', 'name', 'brand_name', 'website_url'])
      .where('workspace_id', 'in', workspaces)
      .where(
        sql<boolean>`(name ilike ${pattern} escape '\\' or brand_name ilike ${pattern} escape '\\' or website_url ilike ${pattern} escape '\\' or industry ilike ${pattern} escape '\\')`,
      );
    if (projectId) projects = projects.where('id', '=', projectId);
    for (const row of await projects.orderBy('id').limit(limit).execute())
      append('project', row.id, row.name, `${row.brand_name} — ${row.website_url}`);
    if (results.length < limit) {
      let opportunities = db
        .selectFrom('opportunities')
        .select(['id', 'title', 'remediation'])
        .where('workspace_id', 'in', workspaces)
        .where('superseded_at', 'is', null)
        .where(
          sql<boolean>`(title ilike ${pattern} escape '\\' or remediation ilike ${pattern} escape '\\' or target_url ilike ${pattern} escape '\\')`,
        );
      if (projectId) opportunities = opportunities.where('project_id', '=', projectId);
      for (const row of await opportunities
        .orderBy('priority_score', 'desc')
        .orderBy('id')
        .limit(limit - results.length)
        .execute())
        append('opportunity', row.id, row.title, row.remediation);
    }
    if (results.length < limit) {
      let prompts = db
        .selectFrom('prompts as p')
        .innerJoin('prompt_sets as s', 's.id', 'p.prompt_set_id')
        .innerJoin('projects as project', 'project.id', 's.project_id')
        .select(['p.id', 'p.text', 'p.theme'])
        .where('project.workspace_id', 'in', workspaces)
        .where(
          sql<boolean>`(p.text ilike ${pattern} escape '\\' or p.theme ilike ${pattern} escape '\\')`,
        );
      if (projectId) prompts = prompts.where('project.id', '=', projectId);
      for (const row of await prompts
        .orderBy('p.id')
        .limit(limit - results.length)
        .execute())
        append('prompt', row.id, row.theme || 'Prompt', row.text);
    }
  }
  return {
    query: normalized,
    results,
    count: results.length,
    pagination: pagination(results, null),
  };
}
