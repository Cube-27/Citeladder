import type { Database } from '../db/database.ts';
import { canonicalPage } from '../traffic/normalization.ts';
import { pathIdentity } from '../crawl-logs/identity.ts';

export async function projectHosts(db: Database, workspaceId: string, projectId: string) {
  const project = await db
    .selectFrom('projects')
    .select('website_url')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', projectId)
    .executeTakeFirstOrThrow();
  const domains = await db
    .selectFrom('owned_domains')
    .innerJoin('projects', 'projects.id', 'owned_domains.project_id')
    .select('owned_domains.domain')
    .where('projects.workspace_id', '=', workspaceId)
    .where('projects.id', '=', projectId)
    .execute();
  return new Set([
    new URL(project.website_url).hostname.toLowerCase(),
    ...domains.map((d) => d.domain.toLowerCase()),
  ]);
}
export function landingPage(path: string, host: string, hosts: ReadonlySet<string>) {
  const normalizedHost = host.toLowerCase();
  if (!hosts.has(normalizedHost) || path === '(not set)') return null;
  const origin = `https://${normalizedHost}`;
  const page = canonicalPage(path.split(/[?#]/u)[0]!, origin);
  return page && new URL(page).origin === origin && pathIdentity(page, origin)?.identity === 'exact'
    ? page
    : null;
}
