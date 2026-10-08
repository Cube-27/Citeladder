import type { Database } from '../db/database.ts';
import { canonicalPage } from '../traffic/normalization.ts';
import { pathIdentity } from '../crawl-logs/identity.ts';

/**
 * The registrable site of a URL, property or bare host: lower-cased, with
 * `sc-domain:` and a leading `www.` removed. Empty when unparseable.
 */
export function siteDomain(value: string): string {
  const bare = value.trim().replace(/^sc-domain:/iu, '');
  try {
    return new URL(bare.includes('://') ? bare : `https://${bare}`).hostname
      .toLowerCase()
      .replace(/^www\./u, '');
  } catch {
    return '';
  }
}

/** The project's sites (website plus owned domains), as `siteDomain` values. */
export async function projectSiteDomains(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<Set<string>> {
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
  return new Set(
    [project.website_url, ...domains.map((d) => d.domain)].map(siteDomain).filter(Boolean),
  );
}

/** Whether a Search Console or Bing property belongs to one of the project's sites. */
export function propertyMatchesSite(propertyRef: string, sites: ReadonlySet<string>): boolean {
  const site = siteDomain(propertyRef);
  return site !== '' && sites.has(site);
}

/** Hostnames that count as the project's own: each site with and without `www.`. */
export async function projectHosts(db: Database, workspaceId: string, projectId: string) {
  const sites = await projectSiteDomains(db, workspaceId, projectId);
  return new Set([...sites].flatMap((site) => [site, `www.${site}`]));
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
