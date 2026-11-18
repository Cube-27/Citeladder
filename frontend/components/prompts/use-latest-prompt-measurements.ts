import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { visibilityQueries } from '@/lib/api/visibility-queries';
import type { ActiveProjectScope } from '@/lib/project/active-project-scope';

import type { PromptMetricItem } from '@citeladder/contracts/visibility';

import type { PromptChange, PromptMeasurement } from './prompt-table';

type PromptScope = Pick<ActiveProjectScope, 'workspaceId' | 'projectId'>;

/** The latest default-market run's prompt rows (Overview). */
export function useLatestPromptMetrics(scope: PromptScope) {
  return useQuery(visibilityQueries.prompts(scope));
}

/**
 * What the run that last measured each prompt found, so a run of other
 * prompts never hides an earlier result.
 *
 * Keyed by the SOURCE prompt id, because that is what this table's rows are.
 * A prompt no run has measured simply has no entry, which reads as a muted
 * dash named "Not measured" rather than a fabricated zero.
 *
 * Undefined until the first read settles: whether a run exists decides the
 * table's columns, so the table waits for it instead of drawing without the
 * measured columns and then squeezing four in beside rows already on screen.
 */
export function useLatestPromptMeasurements(
  scope: PromptScope,
): ReadonlyMap<string, PromptMeasurement> | undefined {
  const result = useQuery(visibilityQueries.latestPerPrompt(scope));
  return useMemo(() => {
    if (result.isLoading) return undefined;
    const map = new Map<string, PromptMeasurement>();
    // A failed read is not a measured absence. Returning an empty map drops the
    // columns entirely, which says "no run yet" rather than "every prompt is
    // unmeasured" — the honest reading when we could not load the figures.
    if (result.isError) return map;
    for (const row of result.data ?? []) {
      if (row.prompt_id) map.set(row.prompt_id, measurementOf(row));
    }
    return map;
  }, [result.data, result.isError, result.isLoading]);
}

function measurementOf(row: PromptMetricItem): PromptMeasurement {
  return {
    visibilityRate: row.visibility_rate ?? null,
    ownedCitationRate: row.owned_citation_rate ?? null,
    change: promptChange(row),
    position: row.avg_position ?? null,
    shareOfVoice: row.share_of_voice ?? null,
    sentiment: row.sentiment ?? null,
    mentions: row.mentions,
    brands: row.brands,
    named: row.named ?? [],
    sources: row.sources ?? [],
    answer: { auditId: row.audit_id, promptIndex: row.prompt_index },
  };
}

/** A row's change since the prompt's previous measurement, or why there is none. */
function promptChange(row: PromptMetricItem): PromptChange {
  if (row.visibility_delta != null) return { kind: 'delta', points: row.visibility_delta };
  if (row.comparison_status === 'no_baseline') return { kind: 'first' };
  // Any other status without a delta is a pair that could not be compared.
  const reason =
    row.comparison_status === 'no_observations' ? 'no_observations' : 'changed_context';
  return { kind: 'not_compared', reason };
}
