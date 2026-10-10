/** Live authorization for persisted MCP evidence. */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { parseUuid } from '../http/uuid.ts';
import { utcText } from '../db/timestamps.ts';
import { McpInputError, type Evidence, type EvidencePrincipal } from './types.ts';
import { mcpPolicy } from './config.ts';
import { workspaceAccess } from '../entitlements/access.ts';
import { requiresEmailVerification } from '../auth/eligibility.ts';
import { rolesWith } from '../auth/workspace.ts';
import { effectiveStatus } from '../opportunities/action-status.ts';
import { appLink, recordPath } from './links.ts';
import { containsPattern } from '../db/like.ts';

// A tool call that authorizes several reads checks grant and membership once.
// Only a principal minted for one call shares its check; any other is live.
const perCall = new WeakMap<EvidencePrincipal, Promise<string[]> | null>();
export function principalForCall(principal: EvidencePrincipal): EvidencePrincipal {
  const call = { ...principal };
  perCall.set(call, null);
  return call;
}
export function authorizedWorkspaceIds(
  db: Database,
  principal: EvidencePrincipal,
): Promise<string[]> {
  if (!perCall.has(principal)) return liveWorkspaceIds(db, principal);
  let result = perCall.get(principal);
  if (!result) {
    result = liveWorkspaceIds(db, principal);
    perCall.set(principal, result);
    result.catch(() => perCall.set(principal, null));
  }
  return result;
}
async function liveWorkspaceIds(db: Database, principal: EvidencePrincipal): Promise<string[]> {
  const identity = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', principal.userId)
    .executeTakeFirst();
  if (!identity?.is_active || requiresEmailVerification(identity)) return [];
  const accessible = async (ids: string[]) => {
    const statuses = await Promise.all(ids.map((id) => workspaceAccess(db, id)));
    return ids.filter((_, index) => ['active', 'trial_active'].includes(statuses[index]!.status));
  };
  if ('kind' in principal) {
    const member = await db
      .selectFrom('workspace_members as m')
      .innerJoin('workspaces as w', 'w.id', 'm.workspace_id')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select('m.workspace_id')
      .where('m.user_id', '=', principal.userId)
      .where('m.workspace_id', '=', principal.workspaceId)
      .where('m.role', 'in', rolesWith('read'))
      .where('w.is_system', '=', false)
      .where('u.is_active', '=', true)
      .executeTakeFirst();
    return accessible(member ? [member.workspace_id] : []);
  }
  const rows = await db
    .selectFrom('workspace_members as member')
    .innerJoin('workspaces as workspace', 'workspace.id', 'member.workspace_id')
    .innerJoin('mcp_oauth_grants as g', 'g.user_id', 'member.user_id')
    .innerJoin('users as account', 'account.id', 'member.user_id')
    .select('member.workspace_id')
    .where('member.user_id', '=', principal.userId)
    .where('member.role', 'in', rolesWith('read'))
    .where('workspace.is_system', '=', false)
    .where('account.is_active', '=', true)
    .where('g.id', '=', principal.grantId)
    .where('g.access_token_hash', '=', principal.tokenHash)
    .where('g.revoked_at', 'is', null)
    .where('g.access_expires_at', '>', sql<Date>`clock_timestamp()`)
    .where(sql<boolean>`g.workspace_ids @> jsonb_build_array(member.workspace_id::text)`)
    .execute();
  return accessible(rows.map((row) => row.workspace_id));
}
export async function authorizeProject(
  db: Database,
  principal: EvidencePrincipal,
  projectId: string,
) {
  const id = parseUuid(projectId);
  if (!id) throw new McpInputError('project_id must be a UUID');
  // A pinned caller learns no more about a sibling project than about a missing one.
  if ('kind' in principal && principal.projectId !== id)
    throw new McpInputError('Project was not found in this account');
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
/** A record a later `fetch` can resolve; the Agent derives a turn's sources from these. */
export const reference = (kind: string, id: string) => ({
  kind,
  id,
  record_uri: `citeladder://${kind}/${id}`,
});
/** Evidence that does not exist yet: never zero, never repaired by reading it. */
export const unavailable = (reason: string): Evidence => ({
  state: 'unavailable',
  reason,
  artifact_refs: [],
});
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
  // A pinned caller searches its own project.
  if ('kind' in principal) projectId ??= principal.projectId;
  const normalized = query.trim();
  if (!normalized) throw new McpInputError('query must not be empty');
  if (projectId) await authorizeProject(db, principal, projectId);
  const workspaces = await authorizedWorkspaceIds(db, principal);
  const results: Record<string, string>[] = [];
  if (!workspaces.length) return { query: normalized, results };
  const pattern = containsPattern(normalized);
  const like = (column: string) => sql<boolean>`${sql.ref(column)} ilike ${pattern} escape '\\'`;
  const append = (kind: string, id: string, project: string, title: string, text: string) =>
    results.push({
      id: `citeladder://${kind}/${id}`,
      title,
      text: text.slice(0, mcpPolicy.search_snippet_chars),
      url: appLink(origin, recordPath(kind, { id }), project),
    });
  let projects = db
    .selectFrom('projects')
    .select(['id', 'name', 'brand_name', 'website_url'])
    .where('workspace_id', 'in', workspaces)
    .where((eb) =>
      eb.or([like('name'), like('brand_name'), like('website_url'), like('industry')]),
    );
  if (projectId) projects = projects.where('id', '=', projectId);
  for (const row of await projects.orderBy('name').orderBy('id').limit(limit).execute())
    append('project', row.id, row.id, row.name, `${row.brand_name} — ${row.website_url}`);
  if (results.length < limit) {
    // Active Actions only: dismissed and finished work is not a current lead.
    let actions = db
      .selectFrom('actions')
      .select(['id', 'project_id', 'target_label', 'approach'])
      .where('workspace_id', 'in', workspaces)
      .where(effectiveStatus(), 'in', policy.opportunity.actions.ACTION_ACTIVE_STATUSES)
      .where((eb) => eb.or([like('target_label'), like('approach'), like('target_url')]));
    if (projectId) actions = actions.where('project_id', '=', projectId);
    for (const row of await actions
      .orderBy(sql`priority_score desc nulls last`)
      .orderBy('id')
      .limit(limit - results.length)
      .execute())
      append('action', row.id, row.project_id, row.target_label || 'Action', row.approach ?? '');
  }
  if (results.length < limit) {
    let prompts = db
      .selectFrom('prompts as p')
      .innerJoin('prompt_sets as s', 's.id', 'p.prompt_set_id')
      .innerJoin('projects as project', 'project.id', 's.project_id')
      .select(['p.id', 's.project_id', 'p.text', 'p.theme'])
      .where('project.workspace_id', 'in', workspaces)
      .where((eb) => eb.or([like('p.text'), like('p.theme')]));
    if (projectId) prompts = prompts.where('project.id', '=', projectId);
    for (const row of await prompts
      .orderBy('p.text')
      .orderBy('p.id')
      .limit(limit - results.length)
      .execute())
      append('prompt', row.id, row.project_id, row.theme || 'Prompt', row.text);
  }
  return { query: normalized, results };
}
