import { randomUUID } from 'node:crypto';
import {
  contentPageSchema,
  contentStructureSchema,
  type ContentLink,
  type ContentPage,
  type ContentTopic,
} from '@citeladder/contracts/site-health';
import { z } from 'zod';

import { policy } from '../config.ts';
import { record } from '../db/json.ts';
import type { Executor } from '../workers/executor.ts';
import { payloadString, taskProject } from '../workers/executor.ts';
import type { ContentCandidate, LinkCandidate } from './content-candidates.ts';
import { enqueueTask } from '../referrals/enqueue.ts';

function pageSummary(page: ContentPage) {
  const { passages: _passages, ...summary } = page;
  return summary;
}

const probability = z.number().min(0).max(1);
const noul = z.object({ type: z.literal('noul'), noul: probability });
const choice = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  confidence: probability,
  probabilities: z.record(z.string(), probability),
});

function selectedChoice(raw: unknown, options: string[]) {
  const answer = choice.safeParse(raw);
  if (!answer.success) return null;
  const distribution = answer.data.probabilities;
  if (
    Object.keys(distribution).length !== options.length ||
    options.some((key) => distribution[key] === undefined) ||
    Math.abs(Object.values(distribution).reduce((sum, value) => sum + value, 0) - 1) > 0.01
  )
    return null;
  if (!options.includes(answer.data.choice)) return null;
  return answer.data;
}

export function selectedAnchor(candidate: LinkCandidate, raw: unknown) {
  const answer = selectedChoice(raw, [
    'none',
    ...candidate.anchors.map((_, index) => String(index)),
  ]);
  if (!answer) return null;
  if (answer.choice === 'none') return { anchor: null, confidence: answer.confidence };
  const anchor = candidate.anchors[Number(answer.choice)];
  if (
    !anchor ||
    candidate.passage.text.slice(anchor.start, anchor.end) !== anchor.text ||
    candidate.passage.linked_ranges.some(
      (range) => anchor.start < range.end && anchor.end > range.start,
    )
  )
    return null;
  return { anchor, confidence: answer.confidence };
}

export function projectContent(manifest: Record<string, unknown>, outcomes: Map<string, unknown>) {
  const pages = contentPageSchema.array().parse(manifest.pages);
  const candidates = manifest.candidates as ContentCandidate[];
  const frozenPolicy = record(manifest.policy);
  const links: ContentLink[] = [];
  const topics = new Map<string, ContentTopic>();
  let unavailable = 0;
  for (const candidate of candidates) {
    const outcome = record(outcomes.get(candidate.id));
    const answers = record(outcome.answers);
    const judgment = noul.safeParse(
      candidate.kind === 'link' ? answers.usefulness : answers.membership,
    );
    if (outcome.state !== 'completed' || !judgment.success) {
      unavailable += 1;
      continue;
    }
    if (candidate.kind === 'link') {
      const selected = selectedAnchor(candidate, answers.anchor);
      if (!selected) {
        unavailable += 1;
        continue;
      }
      if (!selected.anchor || judgment.data.noul < Number(frozenPolicy.usefulness_threshold))
        continue;
      const source = pages.find((page) => page.analysis_id === candidate.source);
      const target = pages.find((page) => page.analysis_id === candidate.target);
      if (!source || !target) throw new Error('Recommendation source is missing');
      links.push({
        id: candidate.id,
        source: pageSummary(source),
        target: pageSummary(target),
        passage: candidate.passage,
        anchor: selected.anchor,
        usefulness: judgment.data.noul,
        anchor_confidence: selected.confidence,
        action_id: null,
        action_status: null,
      });
    } else {
      const label = selectedChoice(answers.label, ['label', 'none']);
      if (!label) {
        unavailable += 1;
        continue;
      }
      if (judgment.data.noul < Number(frozenPolicy.membership_threshold) || label.choice === 'none')
        continue;
      const key = candidate.label.toLocaleLowerCase();
      const topic = topics.get(key) ?? {
        id: randomUUID(),
        label: candidate.label,
        source_analysis_id: candidate.source,
        page_ids: [],
        contextual_links: 0,
        recommendation_ids: [],
      };
      if (!topic.page_ids.includes(candidate.page)) topic.page_ids.push(candidate.page);
      topics.set(key, topic);
    }
  }
  const groups = [...topics.values()].filter((topic) => topic.page_ids.length >= 2);
  for (const topic of groups) {
    const members = pages.filter((page) => topic.page_ids.includes(page.analysis_id));
    const urls = new Set(members.map((page) => page.url));
    topic.contextual_links = members.reduce(
      (count, page) => count + page.contextual_targets.filter((url) => urls.has(url)).length,
      0,
    );
    topic.recommendation_ids = links
      .filter(
        (link) =>
          topic.page_ids.includes(link.source.analysis_id) &&
          topic.page_ids.includes(link.target.analysis_id),
      )
      .map((link) => link.id);
  }
  const assigned = new Set(groups.flatMap((topic) => topic.page_ids));
  return {
    pages: pages.map(pageSummary),
    recommendations: links.sort(
      (a, b) => b.usefulness - a.usefulness || a.source.url.localeCompare(b.source.url),
    ),
    topics: groups,
    unassigned_pages: pages.length - assigned.size,
    unavailable_judgments: unavailable,
    state:
      unavailable === candidates.length && candidates.length
        ? ('unavailable' as const)
        : unavailable ||
            Number(manifest.omitted_pages) ||
            Number(manifest.omitted_passages) ||
            Number(manifest.omitted_candidates)
          ? ('partial' as const)
          : ('completed' as const),
  };
}

export const publishContentStructure: Executor = async (task, { db, checkCancelled }) => {
  const projectId = await taskProject(db, task);
  const runId = payloadString(task, 'run_id');
  if (!runId) throw new Error('Content publication missing run');
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
      .selectFrom('site_content_structure_runs')
      .selectAll()
      .where('id', '=', runId)
      .where('workspace_id', '=', task.workspace_id)
      .where('project_id', '=', projectId)
      .forUpdate()
      .executeTakeFirst();
    if (!run || run.result || run.state === 'cancelled') return;
    const events = await trx
      .selectFrom('site_content_structure_events')
      .select(['candidate_id', 'evidence'])
      .where('run_id', '=', runId)
      .where('workspace_id', '=', task.workspace_id)
      .where('project_id', '=', projectId)
      .where('kind', '=', 'outcome')
      .execute();
    const manifest = record(run.manifest);
    const result = contentStructureSchema.parse({
      id: run.id,
      crawl_id: run.crawl_id,
      created_at: run.created_at.toISOString(),
      page_count: manifest.page_count,
      omitted_pages: manifest.omitted_pages,
      omitted_candidates: manifest.omitted_candidates,
      stale: false,
      ...projectContent(
        manifest,
        new Map(events.map((event) => [event.candidate_id, event.evidence])),
      ),
    });
    await trx
      .updateTable('site_content_structure_runs')
      .set({ state: result.state, result: JSON.stringify(result) })
      .where('id', '=', run.id)
      .where('workspace_id', '=', task.workspace_id)
      .execute();
    await enqueueTask(trx, {
      workspaceId: task.workspace_id,
      projectId,
      kind: 'opportunity_refresh',
      payload: { crawl_id: run.crawl_id },
      keyParts: ['content', run.id],
      maxAttempts: task.max_attempts,
    });
  });
};
