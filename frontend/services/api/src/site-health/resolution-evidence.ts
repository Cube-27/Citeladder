/** Exact attempt and artifact provenance for terminal URL resolution checks. */
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import type { Crawl } from './task-fence.ts';
import { canonicalUrl } from './url-identity.ts';
import {
  canonicalIntegrity,
  entitySetEvaluation,
  finalizeEvaluation,
} from './analysis/finalize.ts';
import type { RuleEvaluation } from './analysis/rules.ts';
import { compareText } from '../text-order.ts';

export type Resolution = {
  status: number | null;
  finalUrl: string;
  redirected: boolean;
  taskId: string;
  attemptId: string;
  artifactId: string | null;
};
const sourceIds = (row: Resolution) => [
  row.taskId,
  row.attemptId,
  ...(row.artifactId ? [row.artifactId] : []),
];
const limit = policy.site_health.page_analysis.facts.limits.evidence_urls;

export async function fetchResolutions(db: Database, crawl: Crawl) {
  const rows = await db
    .selectFrom('site_crawl_tasks as t')
    .innerJoin('site_fetch_attempts as a', (join) =>
      join
        .onRef('a.task_id', '=', 't.id')
        .onRef('a.workspace_id', '=', 't.workspace_id')
        .onRef('a.crawl_id', '=', 't.crawl_id'),
    )
    .leftJoin('site_fetch_artifacts as f', (join) =>
      join
        .onRef('f.id', '=', 'a.artifact_id')
        .onRef('f.task_id', '=', 't.id')
        .onRef('f.workspace_id', '=', 't.workspace_id')
        .onRef('f.crawl_id', '=', 't.crawl_id'),
    )
    .select([
      't.requested_url',
      't.id as taskId',
      'a.status_code',
      'a.id as attemptId',
      'f.final_url',
      'f.redirect_chain',
      'f.id as artifactId',
    ])
    .where('t.workspace_id', '=', crawl.workspace_id)
    .where('t.crawl_id', '=', crawl.id)
    .orderBy('a.created_at')
    .orderBy('a.attempt_number')
    .orderBy('a.request_ordinal')
    .orderBy('a.id')
    .execute();
  const resolutions = new Map<string, Resolution>();
  for (const row of rows) {
    const requested = canonicalUrl(row.requested_url);
    const final = canonicalUrl(row.final_url ?? '') ?? '';
    const value: Resolution = {
      status: row.status_code,
      finalUrl: final,
      redirected:
        (Array.isArray(row.redirect_chain) && row.redirect_chain.length > 0) ||
        Boolean(final && final !== requested),
      taskId: row.taskId,
      attemptId: row.attemptId,
      artifactId: row.artifactId,
    };
    if (requested) resolutions.set(requested, value);
    if (final && row.status_code !== null) resolutions.set(final, { ...value, redirected: false });
  }
  return resolutions;
}

export function canonicalResolution(
  declarations: string[],
  finalUrl: string,
  resolutions: Map<string, Resolution>,
) {
  // The same unique, trimmed set canonicalIntegrity judges: a repeated identical
  // declaration is one canonical, so its target still resolves.
  const unique = [...new Set(declarations.map((value) => value.trim()).filter(Boolean))];
  const target = unique.length === 1 ? (canonicalUrl(unique[0]!, finalUrl) ?? '') : '';
  const resolution = resolutions.get(target);
  const limited = resolution?.status === 429;
  const evaluation = canonicalIntegrity({
    declarations,
    finalUrl,
    targetUrl: target,
    checked: Boolean(resolution) && !limited,
    statusCode: resolution?.status ?? null,
    redirected: resolution?.redirected ?? false,
  });
  if (limited && evaluation.outcome === 'unknown') {
    evaluation.reason_code = 'rate_limited';
    evaluation.evidence = { ...evaluation.evidence, reason: 'rate_limited', status_code: 429 };
  }
  evaluation.evidence = {
    ...evaluation.evidence,
    canonical_url: target,
    final_url: resolution?.finalUrl ?? '',
    redirect_chain_present: resolution?.redirected ?? false,
    ...(resolution ? { observed_status_code: resolution.status } : {}),
    resolution_source_ids: resolution ? sourceIds(resolution) : [],
  };
  return evaluation;
}

export function resolutionSet(
  targets: string[],
  resolutions: Map<string, Resolution>,
  sitemap = false,
): RuleEvaluation {
  const rule = sitemap ? 'technical.sitemap_url_unreachable' : 'technical.broken_internal_link';
  const checked: string[] = [];
  const limited: string[] = [];
  const broken: string[] = [];
  for (const target of targets) {
    const resolution = resolutions.get(target);
    if (resolution?.status === 429) {
      limited.push(target);
      continue;
    }
    if (resolution?.status === undefined || resolution.status === null) continue;
    checked.push(target);
    if (resolution.status >= 400) broken.push(target);
  }
  const evaluation =
    sitemap && !targets.length
      ? finalizeEvaluation(rule, 'not_applicable', { reason: 'no_sitemap' })
      : entitySetEvaluation(rule, targets.length, checked.length, broken);
  if (limited.length && !broken.length) {
    evaluation.outcome = 'unknown';
    evaluation.reason_code = 'rate_limited_targets';
    evaluation.evidence.reason = 'rate_limited_targets';
  }
  evaluation.evidence = {
    ...evaluation.evidence,
    failing_targets: broken
      .slice(0, limit)
      .map((url) => ({ url, status_code: resolutions.get(url)!.status })),
    rate_limited_targets: limited.slice(0, limit).map((url) => ({ url, status_code: 429 })),
    resolution_source_ids: [
      ...new Set([...checked, ...limited].flatMap((url) => sourceIds(resolutions.get(url)!))),
    ]
      .toSorted(compareText)
      .slice(0, limit),
  };
  if (!sitemap) {
    delete evaluation.evidence.normalized_score;
    delete evaluation.evidence.normalized_coverage;
  }
  return evaluation;
}
