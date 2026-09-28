import type { Updateable } from 'kysely';
import { z } from 'zod';
import { commerceCategorySchema } from '@citeladder/contracts/commerce-suite';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import type { CommerceProducts } from '../generated/db-schema.ts';
import type { Executor } from '../workers/executor.ts';
import {
  addMembership,
  appendObservation,
  categoryByName,
  lockCatalog,
  newProduct,
} from './catalog-store.ts';
import { commerceMissing, type CommerceScope } from './reads.ts';
import {
  catalogUrl,
  categoryTitle,
  pageIdentity,
  productAlias,
  productCategories,
  productFacts,
  readFacts,
  shelfLinks,
  type CatalogFacts,
} from './projection-facts.ts';

type Source = Awaited<ReturnType<typeof sourceOf>>;

async function sourceOf(db: Database, scope: CommerceScope, id: string) {
  const source = await db
    .selectFrom('site_page_analyses as a')
    .innerJoin('site_fetch_artifacts as f', 'f.id', 'a.artifact_id')
    .innerJoin('site_urls as u', 'u.id', 'a.site_url_id')
    .select([
      'a.id',
      'a.page_kind',
      'a.crawl_id',
      'a.classifier_version',
      'f.id as artifact_id',
      'f.normalized_facts',
      'f.extractor_version',
      'f.final_url',
      'f.requested_url',
      'u.normalized_url',
      'u.latest_title',
    ])
    .where('a.workspace_id', '=', scope.workspaceId)
    .where('a.project_id', '=', scope.projectId)
    .where('f.workspace_id', '=', scope.workspaceId)
    .where('u.workspace_id', '=', scope.workspaceId)
    .where('u.project_id', '=', scope.projectId)
    .where('a.id', '=', id)
    .executeTakeFirst();
  return source ?? commerceMissing('Source Site Health analysis not found');
}

async function projectCategory(
  db: Database,
  scope: CommerceScope,
  source: Source,
  facts: CatalogFacts,
  url: string,
) {
  const name = categoryTitle(facts, source.latest_title);
  const existing = await db
    .selectFrom('commerce_categories')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('canonical_url', '=', url)
    .executeTakeFirst();
  const category = existing ?? (await categoryByName(db, scope, name));
  const provenance = {
    kind: 'site_health',
    source_id: source.id,
    version: policy.commerce.projector_version,
  };
  const role = commerceCategorySchema.shape.role.safeParse(facts.commerce.category_role);
  await db
    .updateTable('commerce_categories')
    .set({
      name,
      normalized_name: name.toLowerCase().replaceAll(/\s+/gu, ' '),
      canonical_url: url,
      role: role.success ? role.data : 'unknown',
      source_analysis_id: source.id,
      projector_version: policy.commerce.projector_version,
      updated_at: new Date(),
      field_sources: JSON.stringify({
        ...jsonObject(category.field_sources, 'commerce_categories.field_sources'),
        name: provenance,
        role: provenance,
      }),
    })
    .where('id', '=', category.id)
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .execute();
}

async function projectProduct(
  db: Database,
  scope: CommerceScope,
  source: Source,
  facts: CatalogFacts,
  url: string,
) {
  const prior = await db
    .selectFrom('commerce_product_observations')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('source_analysis_id', '=', source.id)
    .where('projector_version', '=', policy.commerce.projector_version)
    .executeTakeFirst();
  if (prior) return;
  const projection = productFacts(facts, url);
  if (!projection.identified) {
    await projectCategory(db, scope, source, facts, url);
    return;
  }
  const existing = await db
    .selectFrom('commerce_products')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('canonical_url', '=', url)
    .executeTakeFirst();
  const product = existing ?? (await newProduct(db, scope, url));
  const sources = jsonObject(product.field_sources, 'commerce_products.field_sources');
  const values: Partial<typeof projection.values> = { ...projection.values };
  for (const field of Object.keys(projection.values) as (keyof typeof projection.values)[]) {
    const value = projection.values[field];
    const provenance =
      sources[field] === undefined ? {} : jsonObject(sources[field], `field_sources.${field}`);
    if (
      provenance.kind === 'csv' ||
      provenance.kind === 'edit' ||
      value === null ||
      value === '' ||
      (typeof value === 'object' && Object.keys(value).length === 0)
    ) {
      delete values[field];
      continue;
    }
    sources[field] = {
      kind: 'site_health',
      source_id: source.id,
      artifact_id: source.artifact_id,
      version: policy.commerce.projector_version,
      ...(projection.evidencePaths[field]
        ? { evidence_path: projection.evidencePaths[field] }
        : {}),
    };
  }
  // Values are selected from one typed product projection. JSON columns are
  // serialized explicitly for pg; no ORM defaults or Python serialization.
  const { variants, attributes, ...scalarValues } = values;
  const update: Updateable<CommerceProducts> = {
    ...scalarValues,
    field_sources: JSON.stringify(sources),
    updated_at: new Date(),
    ...(variants === undefined ? {} : { variants: JSON.stringify(variants) }),
    ...(attributes === undefined ? {} : { attributes: JSON.stringify(attributes) }),
  };
  await db
    .updateTable('commerce_products')
    .set(update)
    .where('id', '=', product.id)
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .execute();
  const observation = await appendObservation(db, scope, product.id, {
    source_kind: 'site_health',
    source_analysis_id: source.id,
    source_artifact_id: source.artifact_id,
    observed_fields: JSON.stringify({
      ...projection.values,
      _evidence_paths: projection.evidencePaths,
    }),
    extractor_version: source.extractor_version,
    classifier_version: source.classifier_version,
    projector_version: policy.commerce.projector_version,
  });
  const names = productCategories(facts, url, [source.final_url, source.requested_url]);
  const membership = await db
    .selectFrom('commerce_product_categories')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('product_id', '=', product.id)
    .limit(1)
    .executeTakeFirst();
  for (const name of names.length || membership ? names : ['Uncategorized']) {
    const category = await categoryByName(db, scope, name.slice(0, 255));
    await addMembership(db, scope, product.id, category.id, observation);
  }
}

/** Reconcile shelf links in either task order using one materialized alias map. */
async function linkShelves(db: Database, scope: CommerceScope, crawlId: string) {
  const shelves = await db
    .selectFrom('commerce_categories as c')
    .innerJoin('site_page_analyses as a', 'a.id', 'c.source_analysis_id')
    .innerJoin('site_fetch_artifacts as f', 'f.id', 'a.artifact_id')
    .select(['c.id', 'f.normalized_facts', 'f.final_url', 'f.requested_url'])
    .where('c.workspace_id', '=', scope.workspaceId)
    .where('c.project_id', '=', scope.projectId)
    .where('a.workspace_id', '=', scope.workspaceId)
    .where('a.project_id', '=', scope.projectId)
    .where('f.workspace_id', '=', scope.workspaceId)
    .execute();
  if (!shelves.length) return;
  const aliases = await db
    .selectFrom('site_urls as u')
    .innerJoin('site_crawl_tasks as t', 't.site_url_id', 'u.id')
    .innerJoin('site_fetch_artifacts as f', 'f.task_id', 't.id')
    .select(['u.normalized_url', 'f.final_url', 'f.normalized_facts'])
    .where('u.workspace_id', '=', scope.workspaceId)
    .where('u.project_id', '=', scope.projectId)
    .where('t.workspace_id', '=', scope.workspaceId)
    .where('t.crawl_id', '=', crawlId)
    .where('f.workspace_id', '=', scope.workspaceId)
    .where('f.fetch_purpose', '=', 'discover')
    .execute();
  const identities = new Map<string, Set<string>>();
  for (const row of aliases) {
    if (row.normalized_facts === null) continue;
    const identity = pageIdentity(
      readFacts(row.normalized_facts),
      row.final_url || row.normalized_url,
    );
    const values = identities.get(row.normalized_url) ?? new Set<string>();
    if (identity) values.add(identity);
    identities.set(row.normalized_url, values);
  }
  const products = await db
    .selectFrom('commerce_products')
    .select(['id', 'canonical_url'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .execute();
  const productsByUrl = new Map(products.map((row) => [catalogUrl(row.canonical_url), row.id]));
  const claimed = new Set<string>();
  for (const shelf of shelves) {
    const links = new Set(
      shelfLinks(readFacts(shelf.normalized_facts), shelf.final_url || shelf.requested_url),
    );
    for (const link of [...links])
      for (const identity of identities.get(link) ?? []) links.add(identity);
    for (const link of [...links]) {
      const alias = productAlias(link);
      if (alias) links.add(alias);
    }
    for (const link of links) {
      const productId = productsByUrl.get(link);
      if (!productId) continue;
      await addMembership(db, scope, productId, shelf.id, null);
      claimed.add(productId);
    }
  }
  if (!claimed.size) return;
  await db
    .deleteFrom('commerce_product_categories')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('product_id', 'in', [...claimed])
    .where(
      'category_id',
      'in',
      db
        .selectFrom('commerce_categories')
        .select('id')
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('normalized_name', '=', 'uncategorized'),
    )
    .execute();
}

export const projectCatalog: Executor = async (task, { db, checkCancelled }) => {
  const payload = jsonObject(task.payload, 'analytics_tasks.payload');
  const analysisId = z.uuid().parse(payload.source_analysis_id).toLowerCase();
  const scope = { workspaceId: task.workspace_id, projectId: z.uuid().parse(task.project_id) };
  await checkCancelled('catalog projection');
  await db.transaction().execute(async (trx) => {
    await lockCatalog(trx, scope);
    const source = await sourceOf(trx, scope, analysisId);
    if (source.page_kind !== 'product' && source.page_kind !== 'category') return;
    const facts = readFacts(source.normalized_facts);
    const url = pageIdentity(facts, source.final_url || source.normalized_url);
    if (!url) throw new Error('Catalog source has no usable URL');
    if (source.page_kind === 'category') await projectCategory(trx, scope, source, facts, url);
    else await projectProduct(trx, scope, source, facts, url);
    await linkShelves(trx, scope, source.crawl_id);
  });
};
