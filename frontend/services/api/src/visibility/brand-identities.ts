/**
 * The marks and websites behind recorded brand names.
 *
 * A mention is persisted as a NAME, resolved against this
 * project's brand and competitor records (every competitor alias included);
 * the tracked brand wins a name collision, and a name that resolves to
 * nothing has no mark rather than a borrowed one. The one resolver for every
 * read that names a brand, so a stored domain always reaches the mark.
 */
import type { FirstNamed } from '@citeladder/contracts/audits';
import type { NamedBrand } from '@citeladder/contracts/visibility';
import { sql } from 'kysely';

import { normalizeDomain } from '../analysis/domains.ts';
import { strings } from '../db/json.ts';
import type { ProjectScope } from '../projects/brand-profile.ts';
import { brandLogoUrl, competitorLogoUrl } from '../projects/logos.ts';
import type { Database } from '../db/database.ts';
import { compareText, scalarText } from '../text-order.ts';
import { selectedCohorts } from './selection.ts';

export type BrandIdentity = { logo_url: string | null; website: string | null };

/** How many named brands a table row shows before its overflow count. */
const LEADING_BRANDS = 3;

/** One name recorded in a set of answers, and how many of them named it. */
export type BrandCount = Pick<NamedBrand, 'kind' | 'name' | 'responses'>;

/**
 * A row's named brands: the distinct count, and the leading few with their
 * marks — most answers first, then the tracked brand before competitors, then
 * by name.
 */
export function leadingBrands(
  counts: readonly BrandCount[],
  identities: ReadonlyMap<string, BrandIdentity>,
): { mentions: number; brands: NamedBrand[] } {
  const ordered = [...counts].sort(
    (left, right) =>
      right.responses - left.responses ||
      compareText(left.kind, right.kind) ||
      compareText(left.name, right.name),
  );
  return {
    mentions: ordered.length,
    brands: ordered.slice(0, LEADING_BRANDS).map((entry) => {
      const identity = identities.get(identityKey(entry.name));
      return {
        kind: entry.kind,
        name: entry.name,
        responses: entry.responses,
        logo_url: identity?.logo_url ?? null,
        website: identity?.website ?? null,
      };
    }),
  };
}

/**
 * `identity_key`: whitespace-collapsed and lowercased. Lowercasing rather than
 * full case folding differs only for letters such as `ß` and final sigma, and
 * both sides of every lookup here are keyed by this one function.
 */
export function identityKey(name: unknown): string {
  return scalarText(name).trim().replace(/\s+/gu, ' ').toLowerCase();
}

/** A stored site or bare domain as `https://host`, or null when none parses. */
function siteOf(value: string | null | undefined): string | null {
  const domain = normalizeDomain(value);
  return domain ? `https://${domain}` : null;
}

/** The mark fields for one recorded name; both null for a name with no record. */
export function markOf(identities: ReadonlyMap<string, BrandIdentity>, name: string) {
  const identity = identities.get(identityKey(name));
  return { logo_url: identity?.logo_url ?? null, website_url: identity?.website ?? null };
}

/** The stored first-named business with its mark; none stays as it is. */
export function markFirstNamed(first: FirstNamed, identities: ReadonlyMap<string, BrandIdentity>) {
  return first.kind === 'brand' || first.kind === 'competitor'
    ? { ...first, ...markOf(identities, first.name) }
    : first;
}

/** Set each named row's logo and website from `identities`, in place. */
export function applyIdentities(
  rows: readonly { name: string; logo_url?: string | null; website_url?: string | null }[],
  identities: ReadonlyMap<string, BrandIdentity>,
): void {
  for (const row of rows) Object.assign(row, markOf(identities, row.name));
}

/** The scope's project marks keyed by `identityKey`. */
export async function brandIdentities(
  db: Database,
  { workspaceId, projectId }: ProjectScope,
): Promise<Map<string, BrandIdentity>> {
  const project = await db
    .selectFrom('projects')
    .select(['id', 'website_url'])
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  const found = new Map<string, BrandIdentity>();
  if (project === undefined) return found;
  const brand = await db
    .selectFrom('brands')
    .select(['name', 'logo_asset_id'])
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .executeTakeFirst();
  if (brand?.name) {
    const owned = project.website_url
      ? undefined
      : await db
          .selectFrom('owned_domains')
          .select('domain')
          .where('workspace_id', '=', workspaceId)
          .where('project_id', '=', projectId)
          .where('domain', '!=', '')
          .orderBy('created_at')
          .limit(1)
          .executeTakeFirst();
    found.set(identityKey(brand.name), {
      logo_url: brand.logo_asset_id ? brandLogoUrl(project.id) : null,
      website: siteOf(project.website_url || owned?.domain),
    });
  }
  const competitors = await db
    .selectFrom('competitors')
    .select(['id', 'name', 'aliases', 'domains', 'logo_asset_id'])
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .orderBy('created_at')
    .execute();
  for (const competitor of competitors) {
    const identity = {
      logo_url: competitor.logo_asset_id ? competitorLogoUrl(project.id, competitor.id) : null,
      website: strings(competitor.domains).map(siteOf).find(Boolean) ?? null,
    };
    for (const name of [competitor.name, ...strings(competitor.aliases)]) {
      const key = identityKey(name);
      if (name && !found.has(key)) found.set(key, identity);
    }
  }
  return found;
}

/**
 * The brands each prompt's answers named, over the same answers its rates
 * count: the tracked brand and every competitor, by distinct answers.
 */
export async function namedBrands(
  db: Database,
  scope: { workspaceId: string },
  query: { auditIds: readonly string[]; cohort: string; engine: string | null },
) {
  const engine = query.engine ? sql`and answer.logical_engine = ${query.engine}` : sql``;
  const answers = sql`
    select answer.id, answer.audit_id, answer.prompt_index
    from response_analyses answer
    where answer.workspace_id = ${scope.workspaceId}
      and answer.audit_id in (${sql.join(query.auditIds)})
      and answer.cohort in (${sql.join([...selectedCohorts(query.cohort)])})
      ${engine}`;
  const { rows } = await sql<BrandCount & { audit_id: string; prompt_index: number }>`
    with answer as (${answers})
    select answer.audit_id, answer.prompt_index, 'brand' as kind, mention.brand_name as name,
      count(distinct answer.id)::int as responses
    from answer join brand_mentions mention on mention.analysis_id = answer.id
      and mention.workspace_id = ${scope.workspaceId}
    where mention.brand_name <> ''
    group by answer.audit_id, answer.prompt_index, mention.brand_name
    union all
    select answer.audit_id, answer.prompt_index, 'competitor' as kind,
      mention.competitor_name as name, count(distinct answer.id)::int as responses
    from answer join competitor_mentions mention on mention.analysis_id = answer.id
      and mention.workspace_id = ${scope.workspaceId}
    where mention.competitor_name <> ''
    group by answer.audit_id, answer.prompt_index, mention.competitor_name
  `.execute(db);
  return rows;
}
