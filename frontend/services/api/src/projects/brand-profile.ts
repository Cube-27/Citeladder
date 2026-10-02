/**
 * The brand profile: a project's reviewed brand knowledge.
 *
 * Native onboarding creates the profile and prompt generation records
 * business-map suggestions in its `business_context`; people edit the four
 * knowledge fields here. Every TypeScript writer takes the project advisory
 * lock before the profile row, shared with native generation.
 */
import { randomUUID } from 'node:crypto';

import {
  brandProfileReviewStateSchema,
  brandProfileSchema,
  brandProfileSourceSchema,
} from '@citeladder/contracts/project';
import type { Selectable } from 'kysely';
import { z } from 'zod';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import type { BrandProfiles } from '../generated/db-schema.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { notFound } from '../errors.ts';

export type ProjectScope = { workspaceId: string; projectId: string };
type BrandProfile = z.input<typeof brandProfileSchema>;
type ProfileRow = Selectable<BrandProfiles>;

const {
  profile_fields: FIELDS,
  profile_text_max_chars: TEXT_MAX,
  profile_product_max_chars: PRODUCT_MAX,
  profile_products_max_count: PRODUCTS_MAX,
} = policy.brand_identity;
const SOURCE_MANUAL = brandProfileSourceSchema.parse(policy.brand_identity.profile_source_manual);
const REVIEW_CONFIRMED = brandProfileReviewStateSchema.parse(
  policy.brand_identity.profile_review_confirmed,
);
const REVIEW_EDITED = brandProfileReviewStateSchema.parse(
  policy.brand_identity.profile_review_edited,
);

type Field = keyof z.infer<typeof brandProfileSchema.shape.sources>;

const text = z.string().max(TEXT_MAX).nullish();

/** A partial edit: an absent or null field is left untouched. */
export const brandProfileUpdate = z.object({
  description: text,
  positioning: text,
  products_services: z.array(z.string().max(PRODUCT_MAX)).max(PRODUCTS_MAX).nullish(),
  target_audience: text,
});
export type BrandProfileUpdate = z.infer<typeof brandProfileUpdate>;

const contractProvenance = brandProfileSchema.shape.sources.shape.description.unwrap();
// Rows written before the onboarding writer carried the reviewer keys store
// provenance entries without them; absent there means no reviewer and no
// review time, so null is their truthful reading, not a fabricated one.
const storedProvenance = contractProvenance.extend({
  reviewed_by: contractProvenance.shape.reviewed_by.default(null),
  reviewed_at: contractProvenance.shape.reviewed_at.default(null),
});
const storedSources = z.record(z.string(), storedProvenance);
// Review times are stored as ISO text; the view renders them as ISO instants.
const viewedSources = z.record(
  z.string(),
  storedProvenance.transform((entry) => ({
    ...entry,
    reviewed_at: entry.reviewed_at === null ? null : new Date(entry.reviewed_at).toISOString(),
  })),
);
const storedArtifacts = z.record(z.string(), z.uuid());
const storedProducts = z.array(z.string());

/** Trim, drop blanks and case-insensitive duplicates (first spelling wins). */
function cleanProducts(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    const item = value.trim();
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      cleaned.push(item);
    }
  }
  return cleaned;
}

export function profileProducts(row: ProfileRow): string[] {
  return storedProducts.parse(row.products_services);
}

function byField<T>(stored: Record<string, T>): Record<Field, T | null> {
  return Object.fromEntries(FIELDS.map((field) => [field, stored[field] ?? null])) as Record<
    Field,
    T | null
  >;
}

function view(row: ProfileRow): BrandProfile {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    brand_id: row.brand_id,
    description: row.description,
    positioning: row.positioning,
    products_services: profileProducts(row),
    target_audience: row.target_audience,
    business_context: jsonObject(row.business_context, 'brand_profiles.business_context'),
    sources: byField(viewedSources.parse(row.sources)),
    source_artifact_ids: byField(storedArtifacts.parse(row.source_artifact_ids)),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** The project's profile row, locked when `forUpdate`, or 404. */
export async function loadProfile(
  db: Database,
  scope: ProjectScope,
  forUpdate = false,
): Promise<ProfileRow> {
  let query = db
    .selectFrom('brand_profiles')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId);
  if (forUpdate) query = query.forUpdate();
  const row = await query.executeTakeFirst();
  if (row === undefined) throw notFound('Brand profile');
  return row;
}

export async function readBrandProfile(db: Database, scope: ProjectScope): Promise<BrandProfile> {
  return view(await loadProfile(db, scope));
}
/** Optional grounding projection; missing memory stays unavailable and provenance stays attached. */
export async function readBrandMemory(db: Database, scope: ProjectScope) {
  const row = await db
    .selectFrom('brand_profiles')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .executeTakeFirst();
  if (!row) return null;
  const profile = view(row),
    business = { ...profile.business_context },
    sources = { ...jsonObject(business.field_sources ?? {}, 'business_context.field_sources') };
  if ('business_type' in business) {
    if (
      !('buyer_type' in business) ||
      (sources.business_type === 'reviewed' && sources.buyer_type !== 'reviewed')
    ) {
      business.buyer_type = business.business_type;
      if (sources.business_type !== undefined) sources.buyer_type = sources.business_type;
    }
    delete business.business_type;
    delete sources.business_type;
  }
  delete business.business_map;
  return { ...profile, business_context: { ...business, field_sources: sources } };
}

/**
 * Apply a person's edits. Each supplied field keeps its original origin, is
 * confirmed (first review) or edited (a later one) by this reviewer, and
 * drops the suggestion artifact it no longer matches.
 */
export function updateBrandProfile(
  db: Database,
  scope: ProjectScope,
  userId: string,
  update: BrandProfileUpdate,
): Promise<BrandProfile> {
  return db.transaction().execute(async (trx) => {
    await acquireProjectLock(trx, scope.projectId);
    const brand = await trx
      .selectFrom('brands')
      .select('id')
      .where('project_id', '=', scope.projectId)
      .executeTakeFirst();
    if (brand === undefined) throw notFound('Brand profile');
    const now = new Date();
    await trx
      .insertInto('brand_profiles')
      .values({
        id: randomUUID(),
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        brand_id: brand.id,
        description: '',
        positioning: '',
        products_services: JSON.stringify([]),
        target_audience: '',
        business_context: JSON.stringify({}),
        sources: JSON.stringify({}),
        source_artifact_ids: JSON.stringify({}),
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.column('project_id').doNothing())
      .execute();
    const row = await loadProfile(trx, scope, true);
    const sources = storedSources.parse(row.sources);
    const artifacts = storedArtifacts.parse(row.source_artifact_ids);
    const values: Partial<Record<Field, string>> = {};
    for (const field of FIELDS as readonly Field[]) {
      const value = update[field];
      if (value === null || value === undefined) continue;
      values[field] =
        typeof value === 'string' ? value.trim() : JSON.stringify(cleanProducts(value));
      const prior = sources[field];
      sources[field] = {
        origin: prior?.origin ?? SOURCE_MANUAL,
        review_state: prior ? REVIEW_EDITED : REVIEW_CONFIRMED,
        reviewed_by: userId,
        reviewed_at: now.toISOString(),
      };
      delete artifacts[field];
    }
    const updated = await trx
      .updateTable('brand_profiles')
      .set({
        ...values,
        sources: JSON.stringify(sources),
        source_artifact_ids: JSON.stringify(artifacts),
        updated_at: now,
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return view(updated);
  });
}
