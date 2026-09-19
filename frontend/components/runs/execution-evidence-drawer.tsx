'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { EvidenceCard } from '@/components/runs/evidence-card';
import { Alert } from '@/components/ui/alert';
import { Drawer } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/api/query-keys';
import { runsApi } from '@/lib/api/runs';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

/**
 * What the drawer needs from whatever row opened it.
 *
 * Structural rather than `Execution`, because the same evidence is reached from
 * two places: a run's executions table, and the source-prompt rows in AI
 * visibility, whose rows are `VisibilityExecutionEvidence` and name the
 * execution as `task_id`. Both satisfy this shape, so neither has to fabricate
 * a full `Execution` to open the answer it already has a handle on.
 *
 * Everything past `id` is a display fallback the drawer shows while the fetch
 * is in flight; the fetched evidence is what it actually renders.
 */
export type EvidenceSubject = {
  /** The execution id. */
  id: string;
  answer_text?: string;
  prompt_text?: string;
  prompt_index?: number;
  repetition?: number;
  logical_engine?: string;
  search_surface_outcome?: string;
};

/** Persisted execution evidence shown without leaving the surface that opened it. */
export function ExecutionEvidenceDrawer({
  execution,
  open,
  onOpenChange,
}: Readonly<{
  execution: EvidenceSubject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const workspaceId = useActiveWorkspaceId();
  const evidenceQuery = useQuery({
    queryKey: queryKeys.runs.execution(execution?.id ?? ''),
    queryFn: ({ signal }) => runsApi.getExecution(execution?.id ?? '', { signal, workspaceId }),
    enabled: open && execution !== null && workspaceId !== null,
  });

  let evidenceBody: ReactNode;
  if (evidenceQuery.isError) {
    evidenceBody = <Alert tone="danger">Could not load this execution&apos;s evidence.</Alert>;
  } else if (evidenceQuery.isLoading || !evidenceQuery.data) {
    evidenceBody = (
      <div className="grid gap-4" aria-label="Loading execution evidence">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  } else {
    evidenceBody = (
      <EvidenceCard
        evidence={evidenceQuery.data}
        answerText={execution?.answer_text}
        promptText={execution?.prompt_text}
        promptIndex={execution?.prompt_index}
        repetition={execution?.repetition}
        isSearchSurface={execution?.logical_engine === 'google_ai_overview'}
        outcome={execution?.search_surface_outcome}
      />
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Execution evidence"
      description={
        execution?.prompt_index === undefined
          ? undefined
          : `Prompt #${execution.prompt_index + 1}` +
            (execution.repetition === undefined ? '' : ` · repetition ${execution.repetition}`)
      }
      className="sm:max-w-220"
      closeLabel="Close evidence drawer"
    >
      {evidenceBody}
    </Drawer>
  );
}
