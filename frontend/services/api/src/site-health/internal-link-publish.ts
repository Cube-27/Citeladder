import {
  internalLinkAnalysisSchema,
  internalLinkPageSchema,
  type InternalLink,
  type InternalLinkPage,
} from '@citeladder/contracts/site-health';
import { z } from 'zod';

import { policy } from '../config.ts';
import { record } from '../db/json.ts';
import type { Executor } from '../workers/executor.ts';
import { payloadString, taskProject } from '../workers/executor.ts';
import { enqueueTask } from '../referrals/enqueue.ts';
import type { LinkCandidate } from './internal-link-candidates.ts';

const probability = z.number().min(0).max(1);
const noul = z.object({ type: z.literal('noul'), noul: probability });
const choice = z.object({ type: z.literal('choice'), choice: z.string() });

function summary(page: InternalLinkPage) {
  const { contextual_targets: _targets, ...rest } = page;
  return rest;
}

/** The chosen supplied option, or the destination's first option. */
function selectedAnchor(candidate: LinkCandidate, raw: unknown): string {
  const answer = choice.safeParse(raw);
  const index = answer.success ? /^a(\d+)$/u.exec(answer.data.choice) : null;
  return candidate.anchors[Number(index?.[1] ?? 0)] ?? candidate.anchors[0]!;
}

function emptyDiagnostics(candidates: number) {
  return {
    candidates,
    completed: 0,
    pending: 0,
    unavailable: 0,
    below_threshold: 0,
    reasons: {} as Record<string, number>,
    elapsed_seconds: 0,
  };
}

export function projectLinks(manifest: Record<string, unknown>, outcomes: Map<string, unknown>) {
  const pages = new Map(
    internalLinkPageSchema
      .array()
      .parse(manifest.pages)
      .map((page) => [page.analysis_id, page]),
  );
  const candidates = manifest.candidates as LinkCandidate[];
  const threshold = Number(record(manifest.policy).accept_threshold);
  const diagnostics = emptyDiagnostics(candidates.length);
  const links: InternalLink[] = [];
  for (const candidate of candidates) {
    if (!outcomes.has(candidate.id)) {
      diagnostics.pending += 1;
      continue;
    }
    const outcome = record(outcomes.get(candidate.id));
    const answers = record(outcome.answers);
    const judgment = noul.safeParse(answers.link);
    if (outcome.state !== 'completed' || !judgment.success) {
      const reason = typeof outcome.reason === 'string' ? outcome.reason : 'unavailable';
      diagnostics.reasons[reason] = (diagnostics.reasons[reason] ?? 0) + 1;
      diagnostics.unavailable += 1;
      continue;
    }
    diagnostics.completed += 1;
    if (judgment.data.noul < threshold) {
      diagnostics.below_threshold += 1;
      continue;
    }
    const source = pages.get(candidate.source);
    const target = pages.get(candidate.target);
    if (!source || !target) throw new Error('Link candidate has no frozen page');
    links.push({
      id: candidate.id,
      source: summary(source),
      target: summary(target),
      anchor: selectedAnchor(candidate, answers.anchor),
      usefulness: judgment.data.noul,
      action_id: null,
      action_status: null,
    });
  }
  let state: 'running' | 'unavailable' | 'partial' | 'completed' = 'completed';
  if (diagnostics.pending) state = 'running';
  else if (diagnostics.candidates && diagnostics.unavailable === diagnostics.candidates)
    state = 'unavailable';
  else if (diagnostics.unavailable || Number(manifest.omitted_pages)) state = 'partial';
  return {
    recommendations: links.toSorted(
      (a, b) => b.usefulness - a.usefulness || a.source.url.localeCompare(b.source.url),
    ),
    diagnostics,
    state,
  };
}

export const publishInternalLinks: Executor = async (task, { db, checkCancelled }) => {
  const projectId = await taskProject(db, task);
  const runId = payloadString(task, 'run_id');
  if (!runId) throw new Error('Internal link publication missing run');
  await checkCancelled('publication');
  await db.transaction().execute(async (trx) => {
    const lease = await trx
      .selectFrom('analytics_tasks')
      .select('id')
      .where('id', '=', task.id)
      .where('lease_owner', '=', task.lease_owner)
      .where('status', '=', policy.task_queue.statuses.running)
      .where('lease_expires_at', '>', new Date())
      .forUpdate()
      .executeTakeFirst();
    if (!lease) return;
    const run = await trx
      .selectFrom('site_internal_link_runs')
      .selectAll()
      .where('id', '=', runId)
      .where('workspace_id', '=', task.workspace_id)
      .where('project_id', '=', projectId)
      .forUpdate()
      .executeTakeFirst();
    if (
      !run ||
      run.state === 'cancelled' ||
      (run.result && !['queued', 'running'].includes(run.state))
    )
      return;
    // Outcomes only: dispatch rows carry request bodies publication never needs.
    const events = await trx
      .selectFrom('site_internal_link_events')
      .select(['candidate_id', 'kind', 'created_at', 'evidence'])
      .where('run_id', '=', runId)
      .where('workspace_id', '=', task.workspace_id)
      .where('project_id', '=', projectId)
      .where('kind', '=', 'outcome')
      .execute();
    const manifest = record(run.manifest);
    const projection = projectLinks(
      manifest,
      new Map(events.map((event) => [event.candidate_id, event.evidence])),
    );
    const latest = Math.max(
      run.created_at.getTime(),
      ...events.map((event) => event.created_at.getTime()),
    );
    projection.diagnostics.elapsed_seconds = (latest - run.created_at.getTime()) / 1000;
    const result = internalLinkAnalysisSchema.parse({
      id: run.id,
      crawl_id: run.crawl_id,
      created_at: run.created_at.toISOString(),
      page_count: manifest.page_count,
      omitted_pages: manifest.omitted_pages,
      stale: false,
      ...projection,
    });
    await trx
      .updateTable('site_internal_link_runs')
      .set({ state: result.state, result: JSON.stringify(result) })
      .where('id', '=', run.id)
      .where('workspace_id', '=', task.workspace_id)
      .execute();
    if (result.state !== 'running')
      await enqueueTask(trx, {
        workspaceId: task.workspace_id,
        projectId,
        kind: 'opportunity_refresh',
        payload: { crawl_id: run.crawl_id },
        keyParts: ['internal-links', run.id],
        maxAttempts: task.max_attempts,
      });
  });
};
