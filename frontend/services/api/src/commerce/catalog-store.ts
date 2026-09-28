import { randomUUID } from 'node:crypto';
import type { Insertable, Selectable } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { CommerceProducts, CommerceProductObservations } from '../generated/db-schema.ts';
import { commerceMissing, type CommerceScope } from './reads.ts';

/** Import and projection serialize at the project, before touching catalog rows. */
export async function lockCatalog(db: Database, scope: CommerceScope) {
  const project = await db
    .selectFrom('projects')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('id', '=', scope.projectId)
    .forUpdate()
    .executeTakeFirst();
  if (!project) commerceMissing('Project not found');
}

export async function newProduct(
  db: Database,
  scope: CommerceScope,
  url: string,
): Promise<Selectable<CommerceProducts>> {
  return db
    .insertInto('commerce_products')
    .values({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      canonical_url: url,
      name: '',
      description: '',
      brand: '',
      price: null,
      currency: '',
      sku: null,
      gtin: null,
      mpn: null,
      observed_external_id: '',
      variants: '[]',
      attributes: '{}',
      field_sources: '{}',
      lifecycle_state: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function categoryByName(db: Database, scope: CommerceScope, name: string) {
  const normalized = name.trim().toLowerCase().replaceAll(/\s+/gu, ' ') || 'uncategorized';
  const existing = await db
    .selectFrom('commerce_categories')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('normalized_name', '=', normalized)
    .executeTakeFirst();
  if (existing) return existing;
  return db
    .insertInto('commerce_categories')
    .values({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      name: normalized === 'uncategorized' ? 'Uncategorized' : name.trim(),
      normalized_name: normalized,
      role: 'unknown',
      canonical_url: '',
      field_sources: '{}',
      source_analysis_id: null,
      projector_version: policy.commerce.projector_version,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function addMembership(
  db: Database,
  scope: CommerceScope,
  productId: string,
  categoryId: string,
  observationId: string | null,
) {
  await db
    .insertInto('commerce_product_categories')
    .values({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      product_id: productId,
      category_id: categoryId,
      source_observation_id: observationId,
      created_at: new Date(),
    })
    .onConflict((oc) => oc.columns(['product_id', 'category_id']).doNothing())
    .execute();
}

type Evidence = Pick<Insertable<CommerceProductObservations>, 'source_kind' | 'observed_fields'> &
  Partial<
    Pick<
      Insertable<CommerceProductObservations>,
      | 'csv_import_id'
      | 'csv_row_number'
      | 'source_analysis_id'
      | 'source_artifact_id'
      | 'extractor_version'
      | 'classifier_version'
      | 'importer_version'
      | 'projector_version'
    >
  >;

export async function appendObservation(
  db: Database,
  scope: CommerceScope,
  productId: string,
  evidence: Evidence,
) {
  const id = randomUUID();
  await db
    .insertInto('commerce_product_observations')
    .values({
      id,
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      product_id: productId,
      csv_import_id: null,
      csv_row_number: null,
      source_analysis_id: null,
      source_artifact_id: null,
      extractor_version: '',
      classifier_version: '',
      importer_version: '',
      projector_version: '',
      edit_version: '',
      created_at: new Date(),
      ...evidence,
    })
    .execute();
  return id;
}
