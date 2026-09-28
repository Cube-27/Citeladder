import {
  buyerPromptSchema,
  commerceCatalogSchema,
  commerceProductSchema,
  competitorCandidateSchema,
  competitorDiscoveryTaskSchema,
  recommendationObservationSchema,
  shelfSchema,
  shelfSnapshotSchema,
} from '@citeladder/contracts/commerce-suite';
import { z } from 'zod';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import { ApiError } from '../errors.ts';

export type CommerceScope = { workspaceId: string; projectId: string };

export function commerceMissing(message: string): never {
  throw new ApiError(404, message, { code: 'commerce_not_found' });
}

function numeric(value: string | null): number | null {
  if (value === null) return null;
  if (!value.trim()) throw new TypeError('Empty persisted numeric');
  return z.number().parse(Number(value));
}

export async function catalog(db: Database, scope: CommerceScope) {
  const products = await db
    .selectFrom('commerce_products')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('name')
    .orderBy('canonical_url')
    .execute();
  const categories = await db
    .selectFrom('commerce_categories')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .execute();
  const memberships = await db
    .selectFrom('commerce_product_categories')
    .select(['product_id', 'category_id'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .execute();
  const tasks = await db
    .selectFrom('analytics_tasks')
    .select(['status', db.fn.countAll<string>().as('count')])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('task_kind', '=', 'commerce_catalog_projection')
    .groupBy('status')
    .execute();
  const byProduct = new Map<string, string[]>();
  const counts = new Map<string, number>();
  for (const row of memberships) {
    byProduct.set(row.product_id, [...(byProduct.get(row.product_id) ?? []), row.category_id]);
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  return commerceCatalogSchema.parse({
    products: products.map(({ workspace_id, project_id, ...row }) => ({
      ...row,
      price: numeric(row.price),
      attributes: jsonObject(row.attributes, 'commerce_products.attributes'),
      field_sources: jsonObject(row.field_sources, 'commerce_products.field_sources'),
      variants: commerceProductSchema.shape.variants.parse(row.variants),
      category_ids: (byProduct.get(row.id) ?? []).sort((a, b) => a.localeCompare(b)),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    })),
    categories: categories
      .map(({ workspace_id, project_id, normalized_name, created_at, updated_at, ...row }) => ({
        ...row,
        product_count: counts.get(row.id) ?? 0,
        field_sources: jsonObject(row.field_sources, 'commerce_categories.field_sources'),
      }))
      .sort(
        (a, b) =>
          b.product_count - a.product_count ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      ),
    projection_tasks: Object.fromEntries(tasks.map((row) => [row.status, Number(row.count)])),
  });
}

const candidateFields = [
  'id',
  'target_kind',
  'target_id',
  'canonical_url',
  'product_name',
  'brand_name',
  'evidence',
  'source_kind',
  'state',
  'decision_at',
] as const;

export async function candidates(db: Database, scope: CommerceScope, id?: string) {
  let query = db
    .selectFrom('commerce_competitor_candidates')
    .select(candidateFields)
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId);
  if (id) query = query.where('id', '=', id);
  return (await query.orderBy('created_at', 'desc').orderBy('id').execute()).map((row) =>
    competitorCandidateSchema.parse({
      ...row,
      evidence: jsonObject(row.evidence, 'commerce_competitor_candidates.evidence'),
      decision_at: row.decision_at?.toISOString() ?? null,
    }),
  );
}

export async function discoveries(db: Database, scope: CommerceScope, ids: string[] | null) {
  const terminal = new Set<string>(policy.task_queue.terminal);
  let query = db
    .selectFrom('analytics_tasks')
    .select(['id', 'payload', 'status', 'error_code'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('task_kind', '=', 'commerce_competitor_discovery');
  if (ids !== null) {
    if (!ids.length) return [];
    query = query.where('id', 'in', ids);
  } else query = query.where('status', 'not in', [...terminal]);
  const rows = await query.orderBy('created_at').orderBy('id').execute();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered =
    ids === null
      ? rows
      : [...new Set(ids)].map(
          (id) => byId.get(id) ?? commerceMissing('Competitor discovery task not found'),
        );
  return ordered.map((row) =>
    competitorDiscoveryTaskSchema.parse({
      id: row.id,
      target: jsonObject(row.payload, 'analytics_tasks.payload').target,
      status: row.status,
      error_code: row.error_code,
      terminal: terminal.has(row.status),
    }),
  );
}

export async function buyerPrompts(db: Database, scope: CommerceScope, id?: string) {
  let query = db
    .selectFrom('prompts as p')
    .innerJoin('prompt_sets as ps', 'ps.id', 'p.prompt_set_id')
    .innerJoin('projects as project', 'project.id', 'ps.project_id')
    .innerJoin('commerce_prompt_targets as t', 't.prompt_id', 'p.id')
    .select([
      'p.id',
      'p.prompt_set_id',
      'p.text',
      'p.enabled',
      't.target_kind',
      't.target_id',
      't.approved_at',
    ])
    .where('project.workspace_id', '=', scope.workspaceId)
    .where('project.id', '=', scope.projectId)
    .where('t.workspace_id', '=', scope.workspaceId)
    .where('t.project_id', '=', scope.projectId);
  if (id) query = query.where('p.id', '=', id);
  return (await query.orderBy('p.created_at').orderBy('p.id').execute()).map(
    ({ target_kind, target_id, approved_at, ...row }) =>
      buyerPromptSchema.parse({
        ...row,
        target: { kind: target_kind, id: target_id },
        approved_at: approved_at?.toISOString() ?? null,
      }),
  );
}

export async function shelf(
  db: Database,
  scope: CommerceScope,
  target: { kind: string; id: string },
  auditId: string | null,
) {
  const snapshots = await db
    .selectFrom('commerce_shelf_snapshots')
    .select([
      'id',
      'audit_id',
      'target_kind',
      'target_id',
      'product_visibility',
      'share_of_shelf',
      'average_shelf_position',
      'first_position_win_rate',
      'successful_execution_count',
      'recognized_slot_count',
      'ranked_execution_count',
      'formula_version',
      'created_at',
    ])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('target_kind', '=', target.kind)
    .where('target_id', '=', target.id)
    .orderBy('created_at', 'desc')
    .orderBy('id')
    .execute();
  const selected = auditId ?? snapshots[0]?.audit_id ?? null;
  const observations =
    selected === null
      ? []
      : await db
          .selectFrom('commerce_recommendation_observations')
          .select([
            'id',
            'audit_id',
            'target_kind',
            'target_id',
            'product_id',
            'competitor_candidate_id',
            'observed_product',
            'observed_brand',
            'classification',
            'observed_title',
            'observed_price',
            'observed_currency',
            'merchant_url',
            'merchant_domain',
            'surface_kind',
            'rank',
            'order_observable',
            'match_confidence',
            'artifact_id',
          ])
          .where('workspace_id', '=', scope.workspaceId)
          .where('project_id', '=', scope.projectId)
          .where('target_kind', '=', target.kind)
          .where('target_id', '=', target.id)
          .where('audit_id', '=', selected)
          .orderBy('created_at', 'desc')
          .orderBy('id')
          .execute();
  return shelfSchema.parse({
    target,
    selected_audit_id: selected,
    snapshots: snapshots
      .filter((row) => !auditId || row.audit_id === auditId)
      .map((row) =>
        shelfSnapshotSchema.parse({
          ...row,
          created_at: row.created_at.toISOString(),
        }),
      ),
    observations: observations.map((row) =>
      recommendationObservationSchema.parse({
        ...row,
        observed_price: numeric(row.observed_price),
      }),
    ),
  });
}
