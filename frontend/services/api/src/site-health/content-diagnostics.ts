import { policy } from '../config.ts';
import { record } from '../db/json.ts';
import type { ContentCandidate } from './content-candidates.ts';

function countOutcome(
  diagnostics: ReturnType<typeof contentDiagnostics>,
  candidate: ContentCandidate,
  outcome: Record<string, unknown>,
): void {
  if (outcome.state === 'completed') diagnostics.completed += 1;
  else {
    const reason = typeof outcome.reason === 'string' ? outcome.reason : 'unavailable';
    diagnostics.reasons[reason] = (diagnostics.reasons[reason] ?? 0) + 1;
  }
  const answers = record(outcome.answers);
  const probability = record(
    candidate.kind === 'link' ? answers.usefulness : answers.membership,
  ).noul;
  if (
    outcome.state !== 'completed' ||
    typeof probability !== 'number' ||
    probability < 0 ||
    probability > 1
  )
    return;
  const bucket = candidate.kind === 'link' ? 'links' : 'topics';
  for (const band of diagnostics.probability_bands) {
    if (probability >= band.threshold) band[bucket] += 1;
  }
}

export function contentDiagnostics(candidates: ContentCandidate[], outcomes: Map<string, unknown>) {
  const diagnostics = {
    candidates: candidates.length,
    completed: 0,
    pending: 0,
    unavailable: 0,
    below_threshold: 0,
    no_anchor: 0,
    rejected_label: 0,
    singleton_topics: 0,
    reasons: {} as Record<string, number>,
    probability_bands: policy.content_structure.probability_bands.map((threshold) => ({
      threshold,
      links: 0,
      topics: 0,
    })),
    link_candidates: candidates.filter((item) => item.kind === 'link').length,
    topic_candidates: candidates.filter((item) => item.kind === 'topic').length,
    links_pending: 0,
    topics_pending: 0,
    requests: 0,
    elapsed_seconds: 0,
  };
  for (const candidate of candidates) {
    if (!outcomes.has(candidate.id)) {
      diagnostics.pending += 1;
      if (candidate.kind === 'link') diagnostics.links_pending += 1;
      else diagnostics.topics_pending += 1;
      continue;
    }
    countOutcome(diagnostics, candidate, record(outcomes.get(candidate.id)));
  }
  return diagnostics;
}
