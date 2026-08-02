'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { EvidenceCard } from '@/components/runs/evidence-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/api/query-keys';
import { runsApi } from '@/lib/api/runs';
import type { Execution } from '@/lib/api/types';

/** Persisted execution evidence shown without leaving the run detail context. */
export function ExecutionEvidenceDrawer({
  execution,
  open,
  onOpenChange,
}: Readonly<{
  execution: Execution | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const evidenceQuery = useQuery({
    queryKey: queryKeys.runs.execution(execution?.id ?? ''),
    queryFn: ({ signal }) => runsApi.getExecution(execution?.id ?? '', { signal }),
    enabled: open && execution !== null,
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-overlay-scrim fixed inset-0 z-[100]" />
        <DialogPrimitive.Content className="border-border-subtle bg-elevated shadow-modal-value fixed top-0 right-0 z-[101] flex h-full w-[min(720px,100vw)] flex-col border-l focus:outline-none">
          <header className="border-border-subtle flex items-center justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-foreground text-heading-sm">
                Execution evidence
              </DialogPrimitive.Title>
              {execution ? (
                <DialogPrimitive.Description className="text-muted mt-0.5 text-xs">
                  Prompt #{execution.prompt_index + 1} · repetition {execution.repetition}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close evidence drawer">
                <X className="size-4" aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            {evidenceQuery.isError ? (
              <Alert tone="danger">Could not load this execution&apos;s evidence.</Alert>
            ) : evidenceQuery.isLoading || !evidenceQuery.data ? (
              <div className="grid gap-4" aria-label="Loading execution evidence">
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-44 w-full" />
                <Skeleton className="h-52 w-full" />
              </div>
            ) : (
              <EvidenceCard evidence={evidenceQuery.data} answerText={execution?.answer_text} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
