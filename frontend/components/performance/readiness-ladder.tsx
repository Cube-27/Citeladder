'use client';

import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { panelClasses } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import type { IntegrationProvider } from '@/lib/api/integrations';
import { performanceApi, type ProjectReadinessStage } from '@/lib/api/performance';
import { queryKeys } from '@/lib/api/query-keys';
import { formatWindowDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Where a freshly connected project's data actually is.
 *
 * A first connect imports a year of history and then derives it, which takes
 * long enough that one undifferentiated spinner — or a dashboard that renders
 * empty — reads as broken. The ladder names the stages instead, so the user
 * can see their own GSC/GA4 numbers the moment the first chunk lands while
 * CiteLadder's own analysis is explicitly still computing.
 *
 * The stages are distinct STATES, not a percentage (invariant 7). In
 * particular `import_failed` is off the ladder rather than a slower
 * `importing`: nothing further is coming, and a spinner there would never
 * stop. Once analysis is ready the ladder has nothing left to say and
 * disappears — a permanent "everything is fine" banner is noise.
 */

const LADDER: readonly { stage: ProjectReadinessStage; label: string }[] = [
  { stage: 'connected', label: 'Connected' },
  { stage: 'importing', label: 'Importing history' },
  { stage: 'core_data_ready', label: 'Search data ready' },
  { stage: 'analysis_ready', label: 'Analysis ready' },
] as const;

/** What the user should understand, in one line, at each stage. */
const EXPLANATION: Record<ProjectReadinessStage, string> = {
  not_connected: 'Connect Search Console or Analytics to start importing this project.',
  connected: 'Connected. The first history import has not started yet.',
  importing:
    'Importing your history. Numbers below fill in as each chunk lands — they are not final yet.',
  import_failed:
    'The history import finished without importing anything. Start a new sync to retry.',
  core_data_ready:
    'Your Search Console and Analytics numbers are ready. CiteLadder’s own analysis is still computing.',
  analysis_ready: 'Everything is ready.',
};

/** Stable identity so an unknown answer never re-renders its readers. */
const EMPTY_PROVIDERS: readonly IntegrationProvider[] = [];

function stageIndex(stage: ProjectReadinessStage): number {
  const index = LADDER.findIndex((step) => step.stage === stage);
  // Off-ladder states (nothing connected, a failed import) have no rung, so
  // no step is drawn as reached.
  return index;
}

function StepMark({ state }: Readonly<{ state: 'done' | 'active' | 'pending' }>) {
  if (state === 'done') {
    return (
      <span className="bg-accent text-accent-fg inline-flex size-5 shrink-0 items-center justify-center rounded-full">
        <Check className="size-3" aria-hidden />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="border-accent text-accent-text inline-flex size-5 shrink-0 items-center justify-center rounded-full border">
        <Spinner size="sm" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="border-border-strong inline-flex size-5 shrink-0 rounded-full border"
    />
  );
}

/**
 * The project's readiness, as ONE query.
 *
 * Both the ladder and the surfaces that ask "is this engine connected at all"
 * read the same cache entry, so they can never disagree about which stage a
 * project is on.
 */
function useProjectReadiness(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.performance.readiness(projectId ?? ''),
    queryFn: ({ signal }) => performanceApi.getReadiness(projectId!, { signal }),
    enabled: Boolean(projectId),
    // While an import is in flight the answer changes on its own, so this
    // keeps asking rather than stranding the user on a stale stage.
    refetchInterval: (query) => {
      const stage = query.state.data?.stage;
      return stage === 'importing' || stage === 'connected' ? 15_000 : false;
    },
  });
}

/**
 * The engines actually connected to this project, or an empty list until the
 * answer is known.
 *
 * Empty means "we do not know of a connection", never "this engine measured
 * nothing" — a surface uses it to decide whether an engine's panel belongs on
 * screen at all, and the two must not render alike.
 */
export function useConnectedProviders(projectId: string | null) {
  return useProjectReadiness(projectId).data?.providers ?? EMPTY_PROVIDERS;
}

export function ReadinessLadder({ projectId }: Readonly<{ projectId: string }>) {
  const readiness = useProjectReadiness(projectId);

  const data = readiness.data;
  if (!data || data.stage === 'analysis_ready') return null;

  if (data.stage === 'import_failed') {
    return <Alert tone="danger">{EXPLANATION.import_failed}</Alert>;
  }
  if (data.stage === 'not_connected') {
    return <Alert tone="info">{EXPLANATION.not_connected}</Alert>;
  }

  const reached = stageIndex(data.stage);
  return (
    <section
      className={cn(panelClasses({ tone: 'panel', pad: 'compact' }), 'grid gap-2')}
      aria-label="Data readiness"
      data-testid="readiness-ladder"
    >
      <ol className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {LADDER.map((step, index) => {
          const state = index < reached ? 'done' : index === reached ? 'active' : 'pending';
          return (
            <li
              key={step.stage}
              className="flex items-center gap-2"
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <StepMark state={state} />
              <span
                className={cn(
                  textRole('label', state === 'pending' ? 'text-muted' : 'text-foreground'),
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={textRole('meta')}>
        {EXPLANATION[data.stage]}
        {data.imported_through
          ? ` Imported through ${formatWindowDate(data.imported_through)}.`
          : ''}
      </p>
    </section>
  );
}
