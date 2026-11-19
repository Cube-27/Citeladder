import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { RetryableRead } from '@/components/ui/notice';
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
 * The latest figures read: still loading, failed with nothing to show, or the
 * measurements. A failed refresh keeps the last good figures.
 */
export type PromptMeasurements =
  | { kind: 'loading' }
  | { kind: 'failed'; read: RetryableRead }
  | { kind: 'ready'; map: ReadonlyMap<string, PromptMeasurement> };

/**
 * What the run that last measured each prompt found, so a run of other
 * prompts never hides an earlier result.
 *
 * Keyed by the SOURCE prompt id, because that is what this table's rows are.
 * A prompt no run has measured simply has no entry, which reads as a muted
 * dash named "Not measured" rather than a fabricated zero.
 *
 * Whether a run exists decides the table's columns, so the table waits for the
 * first read instead of squeezing four columns in beside rows already on screen.
 */
export function useLatestPromptMeasurements(scope: PromptScope): PromptMeasurements {
  const result = useQuery(visibilityQueries.latestPerPrompt(scope));
  const { data, error, refetch, isFetching } = result;
  const map = useMemo(() => {
    if (!data) return undefined;
    const byPrompt = new Map<string, PromptMeasurement>();
    for (const row of data) {
      if (row.prompt_id) byPrompt.set(row.prompt_id, measurementOf(row));
    }
    return byPrompt;
  }, [data]);
  if (map) return { kind: 'ready', map };
  if (result.isError) return { kind: 'failed', read: { error, refetch, isFetching } };
  return { kind: 'loading' };
}

/** The measurements once read; none while loading or after a failed read. */
export function measurementsOf(
  measurements: PromptMeasurements,
): ReadonlyMap<string, PromptMeasurement> | undefined {
  return measurements.kind === 'ready' ? measurements.map : undefined;
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
