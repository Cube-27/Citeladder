/**
 * Competitor-candidate identity: one AI-observed product keeps one canonical
 * page across every target that sees it, so reads can merge its per-target
 * records into one product.
 */
import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';

import type { Database } from '../db/database.ts';
import type { CommerceCompetitorCandidates } from '../generated/db-schema.ts';
import { lockCatalog } from './catalog-store.ts';
import type { ShelfTargetRef } from './catalog-revisions.ts';
import type { CommerceScope } from './reads.ts';
import { boundedText, matchRecommendation } from './shelf-parsing.ts';

export type Candidate = Selectable<CommerceCompetitorCandidates>;

/**
 * The product a new candidate stands for when the project already knows it
 * under any target: the same page, else a known product's name in the title (a
 * marketplace listing of it). Brands alone never match: one brand sells many.
 */
async function knownProduct(
  db: Database,
  { workspaceId, projectId }: CommerceScope,
  title: string,
  url: string,
) {
  const known = await db
    .selectFrom('commerce_competitor_candidates')
    .select(['id', 'canonical_url', 'product_name', 'brand_name'])
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .orderBy(sql`state = 'approved'`, 'desc')
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  const samePage = known.find((row) => row.canonical_url === url);
  if (samePage) return samePage;
  const named = matchRecommendation(title, {
    products: [],
    approved_competitors: known.map((row) => ({ ...row, brand_name: '' })),
  }).competitor;
  return known.find((row) => row.id === named?.id) ?? null;
}

/**
 * The candidate an AI-observed product stands for under `target`: the target's
 * own record of it, else a new pending one.
 */
export async function findOrCreateCandidate(
  db: Database,
  scope: CommerceScope,
  target: ShelfTargetRef,
  observed: { title: string; brand: string; evidence: Record<string, unknown> },
  observedUrl: string,
): Promise<Candidate> {
  const { workspaceId, projectId } = scope;
  const find = (url: string) =>
    db
      .selectFrom('commerce_competitor_candidates')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('project_id', '=', projectId)
      .where('target_kind', '=', target.target_kind)
      .where('target_id', '=', target.target_id)
      .where('canonical_url', '=', url)
      .executeTakeFirst();
  const existing = await find(observedUrl);
  if (existing) return existing;
  // Concurrent audit completions serialize new pending candidates on the
  // owning project, identity lookup included, so two first sightings agree.
  await lockCatalog(db, { workspaceId, projectId });
  // A product known under another target keeps its identity here, so the
  // Products read merges this target's record with it (one row per product).
  const known = await knownProduct(db, scope, observed.title, observedUrl);
  const url = known?.canonical_url ?? observedUrl;
  const raced = await find(url);
  if (raced) return raced;
  return db
    .insertInto('commerce_competitor_candidates')
    .values({
      id: randomUUID(),
      workspace_id: workspaceId,
      project_id: projectId,
      target_kind: target.target_kind,
      target_id: target.target_id,
      canonical_url: url,
      product_name: boundedText(known?.product_name ?? observed.title, 512),
      brand_name: boundedText(known?.brand_name || observed.brand, 255),
      state: 'pending',
      source_kind: 'ai_observed',
      evidence: JSON.stringify(observed.evidence),
      attempt_id: null,
      decision_at: null,
      created_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
