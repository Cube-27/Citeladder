import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { record, strings } from '../db/json.ts';
import type { AuditTask } from '../queue/audit-queue.ts';
import type { DeriveExecution, ExecutionResult } from '../audits/result-persistence.ts';
import { analyzeExecution } from '../analysis/execution.ts';
import { auditPolicy } from '../audits/config.ts';
import { createModelGateway } from '../models/gateway.ts';
import {
  boundedText,
  frozenTargetSchema,
  matchRecommendation,
  observedMerchant,
  observedPrice,
  prepareRecommendations,
  resolvedBatchSchema,
  resolvedCompetitorUrl,
  shelfPolicy,
  type ShelfResolver,
} from './shelf-parsing.ts';

export function frozenShelfIds(frozen: Record<string, unknown>) {
  return strings(frozen.prompt_target_ids).filter((id) => z.uuid().safeParse(id).success);
}
function configuredResolver(): ShelfResolver | undefined {
  try {
    const gateway = createModelGateway();
    return {
      model: gateway.model,
      resolve: async (span) =>
        (
          await gateway.structured(
            'Extract only recommended products from this bounded answer span. Keep product identity separate from merchant and citation URLs. Set product_url only when the URL identifies the recommended PDP; set merchant_url only for a seller link. Return an empty list when uncertain.',
            JSON.stringify({ span }),
            resolvedBatchSchema,
          )
        ).value,
    };
  } catch {
    return undefined;
  }
}

/** Read frozen context, then finish optional model I/O before the caller opens its persistence transaction. */
export async function prepareShelfExecution(
  db: Database,
  task: AuditTask,
  result: Pick<ExecutionResult, 'answer_text'>,
  resolver: ShelfResolver | null | undefined = undefined,
): Promise<DeriveExecution> {
  const audit = await db
    .selectFrom('audits')
    .selectAll()
    .where('workspace_id', '=', task.workspace_id)
    .where('id', '=', task.audit_id)
    .executeTakeFirstOrThrow();
  if (audit.audit_scope !== 'commerce') return analyzeExecution;
  const config = record(audit.configuration),
    frozen = record(config.commerce_measurement);
  const ids = frozenShelfIds(frozen);
  if (!ids.length) return analyzeExecution;
  const target = await db
    .selectFrom('commerce_prompt_targets as c')
    .innerJoin('audit_prompt_snapshots as s', 's.prompt_id', 'c.prompt_id')
    .selectAll('c')
    .where('c.workspace_id', '=', task.workspace_id)
    .where('c.project_id', '=', audit.project_id)
    .where('c.id', 'in', ids)
    .where('s.audit_id', '=', audit.id)
    .where('s.id', '=', task.prompt_snapshot_id)
    .executeTakeFirst();
  if (!target) return analyzeExecution;
  const values = Array.isArray(frozen.targets) ? frozen.targets : [];
  const parsed = frozenTargetSchema.safeParse(
    values.find((value) => {
      const row = record(value);
      return row.kind === target.target_kind && row.id === target.target_id;
    }),
  );
  if (!parsed.success) return analyzeExecution;
  const catalog = parsed.data;
  const prepared = await prepareRecommendations(
    result.answer_text,
    catalog,
    resolver === undefined ? configuredResolver() : (resolver ?? undefined),
  );
  const versions = {
    parser:
      typeof frozen.parser_version === 'string'
        ? frozen.parser_version
        : auditPolicy.commerce_versions.parser_version,
    matcher:
      typeof frozen.matcher_version === 'string'
        ? frozen.matcher_version
        : auditPolicy.commerce_versions.matcher_version,
  };
  const locale = [config.language_code, config.country_code]
    .filter((value) => typeof value === 'string' && value)
    .join('-');
  return async (trx, current, lockedAudit, artifactId) => {
    await analyzeExecution(trx, current, lockedAudit, artifactId);
    if (
      current.id !== task.id ||
      lockedAudit.id !== audit.id ||
      current.workspace_id !== task.workspace_id
    )
      throw new Error('Commerce execution scope mismatch');
    const existing = await trx
      .selectFrom('commerce_recommendation_observations')
      .select(['id', 'artifact_id'])
      .where('workspace_id', '=', task.workspace_id)
      .where('audit_id', '=', audit.id)
      .where('task_id', '=', task.id)
      .where('parser_version', '=', versions.parser)
      .where('matcher_version', '=', versions.matcher)
      .executeTakeFirst();
    if (existing) {
      if (existing.artifact_id !== artifactId) throw new Error('Commerce artifact mismatch');
      return;
    }
    const artifact = await trx
      .selectFrom('raw_response_artifacts')
      .select(['answer_text', 'citations'])
      .where('id', '=', artifactId)
      .where('audit_id', '=', audit.id)
      .where('task_id', '=', task.id)
      .executeTakeFirstOrThrow();
    if (artifact.answer_text !== result.answer_text)
      throw new Error('Prepared Commerce evidence mismatch');
    const citations = await trx
      .selectFrom('citations')
      .select(['id', 'url'])
      .where('workspace_id', '=', task.workspace_id)
      .where('audit_id', '=', audit.id)
      .where('artifact_id', '=', artifactId)
      .execute();
    const sourceUrls = Array.isArray(artifact.citations)
      ? artifact.citations
          .map((value) => record(value).url)
          .filter((value): value is string => typeof value === 'string')
      : [];
    for (const item of prepared) {
      const { span, resolved } = item;
      const identity = resolved
        ? `${resolved.title} ${resolved.brand} ${resolved.product_url}`
        : span.text;
      const matched = matchRecommendation(identity, catalog);
      let candidateId = matched.competitor?.id ?? null;
      let observedCandidate: { product_name: string; brand_name: string } | undefined;
      if (!matched.product && !matched.competitor && resolved) {
        const url = resolvedCompetitorUrl(resolved.product_url, sourceUrls);
        if (url) {
          let candidate = await trx
            .selectFrom('commerce_competitor_candidates')
            .selectAll()
            .where('workspace_id', '=', task.workspace_id)
            .where('project_id', '=', audit.project_id)
            .where('target_kind', '=', target.target_kind)
            .where('target_id', '=', target.target_id)
            .where('canonical_url', '=', url)
            .executeTakeFirst();
          if (!candidate) {
            // Concurrent audit completions serialize new pending candidates on the owning project.
            await trx
              .selectFrom('projects')
              .select('id')
              .where('workspace_id', '=', task.workspace_id)
              .where('id', '=', audit.project_id)
              .forUpdate()
              .executeTakeFirstOrThrow();
            candidate = await trx
              .selectFrom('commerce_competitor_candidates')
              .selectAll()
              .where('workspace_id', '=', task.workspace_id)
              .where('project_id', '=', audit.project_id)
              .where('target_kind', '=', target.target_kind)
              .where('target_id', '=', target.target_id)
              .where('canonical_url', '=', url)
              .executeTakeFirst();
            if (!candidate)
              candidate = await trx
                .insertInto('commerce_competitor_candidates')
                .values({
                  id: randomUUID(),
                  workspace_id: task.workspace_id,
                  project_id: audit.project_id,
                  target_kind: target.target_kind,
                  target_id: target.target_id,
                  canonical_url: url,
                  product_name: resolved.title,
                  brand_name: resolved.brand,
                  state: 'pending',
                  source_kind: 'ai_observed',
                  evidence: JSON.stringify({
                    observation_text: boundedText(span.text, shelfPolicy.span_chars),
                    resolved_product_url: url,
                    merchant_url: resolved.merchant_url,
                  }),
                  attempt_id: null,
                  decision_at: null,
                  created_at: new Date(),
                })
                .returningAll()
                .executeTakeFirstOrThrow();
          }
          candidateId = candidate.id;
          observedCandidate = candidate;
        }
      }
      const price =
        resolved?.price !== null && resolved?.price !== undefined
          ? { price: resolved.price, currency: resolved.currency.toUpperCase() }
          : observedPrice(span.text, locale);
      const merchant = observedMerchant(span.text, resolved?.merchant_url);
      const id = randomUUID();
      await trx
        .insertInto('commerce_recommendation_observations')
        .values({
          id,
          workspace_id: task.workspace_id,
          project_id: audit.project_id,
          audit_id: audit.id,
          task_id: task.id,
          artifact_id: artifactId,
          target_kind: target.target_kind,
          target_id: target.target_id,
          parser_version: versions.parser,
          matcher_version: versions.matcher,
          product_id: matched.product?.id ?? null,
          competitor_candidate_id: candidateId,
          classification: matched.product
            ? 'owned'
            : matched.competitor
              ? 'approved_competitor'
              : observedCandidate
                ? 'ai_observed_competitor'
                : 'unresolved',
          observed_product:
            matched.product?.name ??
            matched.competitor?.product_name ??
            observedCandidate?.product_name ??
            resolved?.title ??
            boundedText(span.text, 512),
          observed_brand:
            matched.product?.brand ??
            matched.competitor?.brand_name ??
            observedCandidate?.brand_name ??
            resolved?.brand ??
            '',
          observed_title: resolved?.title ?? boundedText(span.text, 512),
          observed_price: price.price === null ? null : String(price.price),
          observed_currency: price.currency,
          merchant_url: merchant.url,
          merchant_domain: merchant.domain,
          model_version: item.model,
          match_confidence: matched.confidence,
          rank: span.rank,
          order_observable: span.orderObservable,
          surface_kind: resolved?.surface_kind ?? 'recommendation',
          created_at: new Date(),
        })
        .execute();
      const linked = citations.filter(
        (citation) => citation.url && span.text.includes(citation.url),
      );
      if (linked.length)
        await trx
          .insertInto('commerce_observation_citations')
          .values(
            linked.map((citation) => ({
              id: randomUUID(),
              observation_id: id,
              citation_id: citation.id,
            })),
          )
          .execute();
    }
  };
}
