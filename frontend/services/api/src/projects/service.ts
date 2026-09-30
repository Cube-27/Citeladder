import { randomUUID } from 'node:crypto';

import { benchmarkModeSchema, projectSchema } from '@citeladder/contracts/project';
import type { Insertable, Selectable } from 'kysely';
import type { z } from 'zod';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { admitProject, requireProjectDeletion } from '../entitlements/occupancy.ts';
import { ApiError, notFound } from '../errors.ts';
import type { Projects } from '../generated/db-schema.ts';
import { promptSetView } from '../prompts/views.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { cleanList, type ProjectCreate, type ProjectUpdate } from './inputs.ts';
import { brandLogoUrl, competitorLogoUrl } from './logos.ts';
import type { ProjectScope } from './brand-profile.ts';

export type ProjectView = z.input<typeof projectSchema>;
const stringArray = projectSchema.shape.owned_domains;

async function projectRow(db: Database, scope: ProjectScope) {
  const row = await db
    .selectFrom('projects')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('id', '=', scope.projectId)
    .executeTakeFirst();
  if (!row) throw notFound('Project');
  return row;
}

/** Batch the embedded identity and prompt library for the entire project list. */
async function views(
  db: Database,
  workspaceId: string,
  rows: Selectable<Projects>[],
): Promise<ProjectView[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const brands = await db.selectFrom('brands').selectAll().where('project_id', 'in', ids).execute();
  const aliases = brands.length
    ? await db
        .selectFrom('brand_aliases')
        .selectAll()
        .where(
          'brand_id',
          'in',
          brands.map((brand) => brand.id),
        )
        .execute()
    : [];
  const competitors = await db
    .selectFrom('competitors')
    .selectAll()
    .where('project_id', 'in', ids)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  const owned = await db
    .selectFrom('owned_domains')
    .selectAll()
    .where('project_id', 'in', ids)
    .execute();
  const unintended = await db
    .selectFrom('unintended_domains')
    .selectAll()
    .where('project_id', 'in', ids)
    .execute();
  const sets = await db
    .selectFrom('prompt_sets')
    .selectAll()
    .where('project_id', 'in', ids)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  const prompts = await db
    .selectFrom('prompts')
    .innerJoin('prompt_sets', 'prompt_sets.id', 'prompts.prompt_set_id')
    .innerJoin('projects', 'projects.id', 'prompt_sets.project_id')
    .selectAll('prompts')
    .where('projects.workspace_id', '=', workspaceId)
    .where('projects.id', 'in', ids)
    .orderBy('prompts.created_at')
    .orderBy('prompts.id')
    .execute();
  return rows.map((row) => {
    const brand = brands.find((item) => item.project_id === row.id);
    return {
      ...row,
      benchmark_mode: benchmarkModeSchema.parse(row.benchmark_mode),
      brand_name: brand?.name ?? row.brand_name,
      brand: {
        aliases: aliases.filter((item) => item.brand_id === brand?.id).map((item) => item.alias),
        logo_url: brand?.logo_asset_id ? brandLogoUrl(row.id) : null,
      },
      owned_domains: owned.filter((item) => item.project_id === row.id).map((item) => item.domain),
      unintended_domains: unintended
        .filter((item) => item.project_id === row.id)
        .map((item) => item.domain),
      competitors: competitors
        .filter((item) => item.project_id === row.id)
        .map((item) => ({
          id: item.id,
          name: item.name,
          aliases: stringArray.parse(item.aliases),
          domains: stringArray.parse(item.domains),
          logo_url: item.logo_asset_id ? competitorLogoUrl(row.id, item.id) : null,
        })),
      prompt_sets: sets
        .filter((item) => item.project_id === row.id)
        .map((set) =>
          promptSetView(
            set,
            prompts.filter((item) => item.prompt_set_id === set.id),
          ),
        ),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  });
}

export async function readProject(db: Database, scope: ProjectScope): Promise<ProjectView> {
  const result = await views(db, scope.workspaceId, [await projectRow(db, scope)]);
  return result[0]!;
}
export async function listProjects(db: Database, workspaceId: string): Promise<ProjectView[]> {
  const rows = await db
    .selectFrom('projects')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  return views(db, workspaceId, rows);
}

function searchContext(country: string, language: string) {
  const locations: Record<string, number> = policy.projects.location_codes;
  const normalized = language.toLowerCase();
  return {
    serp_location_code: locations[country.toUpperCase()] ?? 0,
    serp_language_code: policy.projects.language_codes.includes(normalized) ? normalized : '',
  };
}

/** Caller owns the transaction, including onboarding's atomic completion. */
export async function insertProject(
  db: Database,
  workspaceId: string,
  reviewerId: string | null,
  input: ProjectCreate,
  sources?: Record<string, unknown>,
  artifacts: Record<string, unknown> = {},
) {
  await admitProject(db, workspaceId);
  const now = new Date();
  const id = randomUUID();
  const {
    name,
    brand_name,
    website_url,
    industry,
    subindustry,
    primary_market,
    country_code,
    language_code,
    benchmark_mode,
    default_repetitions,
  } = input;
  await db
    .insertInto('projects')
    .values({
      id,
      workspace_id: workspaceId,
      name,
      brand_name,
      website_url,
      industry,
      subindustry,
      primary_market,
      country_code,
      language_code,
      benchmark_mode,
      default_repetitions,
      ...searchContext(country_code, language_code),
      created_at: now,
      updated_at: now,
    })
    .execute();
  const brandId = randomUUID();
  await db
    .insertInto('brands')
    .values({
      id: brandId,
      project_id: id,
      name: brand_name,
      logo_asset_id: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  await replaceCollections(db, id, brandId, input, now);
  const fields = {
    description: input.description,
    positioning: input.positioning,
    products_services: cleanList(input.products_services),
    target_audience: input.target_audience,
  };
  const provenance =
    sources ??
    Object.fromEntries(
      Object.entries(fields)
        .filter(([, value]) => value.length)
        .map(([key]) => [
          key,
          {
            origin: policy.brand_identity.profile_source_manual,
            review_state: reviewerId
              ? policy.brand_identity.profile_review_confirmed
              : 'unreviewed',
            reviewed_by: reviewerId,
            reviewed_at: reviewerId ? now.toISOString() : null,
          },
        ]),
    );
  await db
    .insertInto('brand_profiles')
    .values({
      id: randomUUID(),
      workspace_id: workspaceId,
      project_id: id,
      brand_id: brandId,
      ...fields,
      products_services: JSON.stringify(fields.products_services),
      business_context: JSON.stringify(input.business_context),
      sources: JSON.stringify(provenance),
      source_artifact_ids: JSON.stringify(artifacts),
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}

async function replaceCollections(
  db: Database,
  projectId: string,
  brandId: string,
  input: ProjectUpdate,
  now: Date,
) {
  if (input.brand !== undefined) {
    await db.deleteFrom('brand_aliases').where('brand_id', '=', brandId).execute();
    const values = cleanList(input.brand.aliases).map((alias) => ({
      id: randomUUID(),
      brand_id: brandId,
      alias,
      created_at: now,
    }));
    if (values.length) await db.insertInto('brand_aliases').values(values).execute();
  }
  // One transaction connection: finish each delete before inserting its replacement rows.
  for (const [table, values] of [
    ['owned_domains', input.owned_domains],
    ['unintended_domains', input.unintended_domains],
  ] as const) {
    if (values === undefined) continue;
    await db.deleteFrom(table).where('project_id', '=', projectId).execute();
    const rows = cleanList(values).map((domain) => ({
      id: randomUUID(),
      project_id: projectId,
      domain,
      created_at: now,
    }));
    if (rows.length) await db.insertInto(table).values(rows).execute();
  }
  if (input.competitors !== undefined) {
    await db.deleteFrom('competitors').where('project_id', '=', projectId).execute();
    const values = input.competitors.map((item) => ({
      id: randomUUID(),
      project_id: projectId,
      name: item.name,
      aliases: JSON.stringify(cleanList(item.aliases)),
      domains: JSON.stringify(cleanList(item.domains)),
      logo_asset_id: null,
      created_at: now,
      updated_at: now,
    }));
    if (values.length) await db.insertInto('competitors').values(values).execute();
  }
}

export async function createProject(
  db: Database,
  workspaceId: string,
  userId: string,
  input: ProjectCreate,
) {
  const projectId = await db
    .transaction()
    .execute((trx) => insertProject(trx, workspaceId, userId, input));
  return readProject(db, { workspaceId, projectId });
}
export async function updateProject(db: Database, scope: ProjectScope, input: ProjectUpdate) {
  await db.transaction().execute(async (trx) => {
    await acquireProjectLock(trx, scope.projectId);
    const row = await projectRow(trx, scope);
    const brand = await trx
      .selectFrom('brands')
      .selectAll()
      .where('project_id', '=', scope.projectId)
      .executeTakeFirstOrThrow();
    const { brand: brandInput, competitors, owned_domains, unintended_domains, ...fields } = input;
    const updates: Partial<Insertable<Projects>> = { ...fields, updated_at: new Date() };
    if (input.country_code !== undefined || input.language_code !== undefined)
      Object.assign(
        updates,
        searchContext(
          input.country_code ?? row.country_code,
          input.language_code ?? row.language_code,
        ),
      );
    await trx
      .updateTable('projects')
      .set(updates)
      .where('id', '=', row.id)
      .where('workspace_id', '=', scope.workspaceId)
      .execute();
    if (input.brand_name !== undefined)
      await trx
        .updateTable('brands')
        .set({ name: input.brand_name, updated_at: new Date() })
        .where('id', '=', brand.id)
        .execute();
    await replaceCollections(
      trx,
      row.id,
      brand.id,
      { brand: brandInput, competitors, owned_domains, unintended_domains },
      new Date(),
    );
  });
  return readProject(db, scope);
}
export async function deleteProject(db: Database, scope: ProjectScope) {
  try {
    await db.transaction().execute(async (trx) => {
      await acquireProjectLock(trx, scope.projectId);
      await projectRow(trx, scope);
      await requireProjectDeletion(trx, scope.workspaceId);
      await trx
        .deleteFrom('projects')
        .where('workspace_id', '=', scope.workspaceId)
        .where('id', '=', scope.projectId)
        .execute();
    });
  } catch (error) {
    if (['23503', '23001'].includes(jsonObjectErrorCode(error)))
      throw new ApiError(409, 'Project is referenced by immutable execution evidence');
    throw error;
  }
}
function jsonObjectErrorCode(error: unknown) {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : '';
}
