import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { TableCell, TableCellLines, TableRow, TableSelectCell } from '@/components/ui/table';
import type { PromptCandidate, PromptSet, Topic } from '@citeladder/contracts';
import { promptsQueries } from '@/lib/api/prompts';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { qualityFlagLabel, qualityStatusLabel } from '@/lib/prompts/candidate-quality';
import type { usePromptCandidates } from '@/lib/prompts/use-prompt-candidates';
import { Notice } from '@/components/ui/notice';
import { pluralCount } from '@/lib/format';
import { PROMPT_BUILDER_REVIEW_HREF } from '@/lib/prompts/routes';
import { ProjectLink } from '@/components/ui/project-link';

const COLUMNS: readonly DataTableColumn[] = [{ key: 'suggestion', label: 'Suggestion' }];

/** The suggestions picked for review, held by the builder so its footer can track them. */
export function useCandidateSelection(candidates: readonly PromptCandidate[]) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  // Reviewed ids leave `candidates` and so drop out of `selected`; a failed
  // request keeps the selection for a retry.
  const selected = useMemo(
    () => candidates.filter((candidate) => picked.has(candidate.id)).map((c) => c.id),
    [candidates, picked],
  );
  return { picked, setPicked, selected };
}

export type CandidateSelection = ReturnType<typeof useCandidateSelection>;

/**
 * Generated prompts awaiting review. Only accepted candidates become tracked
 * prompts (the builder's footer accepts the selection); rejected ones are
 * deleted. Rows arrive ranked; quality flags are advisory and never hide a
 * suggestion.
 */
export function CandidateReview({
  candidates,
  topics,
  selection,
  onReject,
  isReviewing,
  error,
  notice,
}: Readonly<{
  candidates: PromptCandidate[];
  topics: Topic[];
  selection: CandidateSelection;
  onReject: (ids: string[]) => void;
  isReviewing?: boolean;
  error?: string;
  notice?: string | null;
}>) {
  const descriptionId = useId();
  const { picked, setPicked, selected } = selection;
  const topicNames = useMemo(
    () => new Map(topics.map((topic) => [topic.id, topic.name])),
    [topics],
  );

  let allState: boolean | 'indeterminate' = false;
  if (selected.length === candidates.length && candidates.length > 0) allState = true;
  else if (selected.length > 0) allState = 'indeterminate';

  const toggle = (id: string, checked: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Stack gap="compact" className="min-w-0">
      {error ? <Notice tone="negative">{error}</Notice> : null}
      {notice ? <Notice tone="positive">{notice}</Notice> : null}
      <DataTable
        title={`Review ${pluralCount(candidates.length, 'suggestion')}`}
        toolbar={{
          status: <span className="type-caption tabular-nums">{selected.length} selected</span>,
          actions: (
            <Button
              variant="quiet"
              onClick={() => onReject(selected)}
              disabled={isReviewing || selected.length === 0}
            >
              <Icon icon={X} />
              Reject selected
            </Button>
          ),
        }}
        selection={{
          all: allState,
          onAllChange: (checked) =>
            setPicked(checked ? new Set(candidates.map((c) => c.id)) : new Set()),
          noun: 'suggestions',
        }}
        columns={COLUMNS}
      >
        {candidates.map((candidate) => {
          const topicName = candidate.topic_id ? topicNames.get(candidate.topic_id) : undefined;
          const notesId = `${descriptionId}-${candidate.id}`;
          const notes = [
            candidate.grounded ? 'Informed by your search data' : null,
            qualityStatusLabel(candidate),
            ...candidate.quality_flags.map(qualityFlagLabel),
          ].filter((note) => note !== null);
          return (
            <TableRow key={candidate.id}>
              <TableSelectCell
                label={`Select “${candidate.text}”`}
                describedBy={notes.length ? notesId : undefined}
                checked={picked.has(candidate.id)}
                onCheckedChange={(checked) => toggle(candidate.id, checked)}
                disabled={isReviewing}
              />
              <TableCell>
                <TableCellLines
                  primary={candidate.text}
                  secondary={
                    topicName || notes.length ? (
                      <>
                        {topicName}
                        {topicName && notes.length ? ' · ' : null}
                        {notes.length ? <span id={notesId}>{notes.join(' · ')}</span> : null}
                      </>
                    ) : null
                  }
                />
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>
    </Stack>
  );
}

/** The review list for the Prompt Builder, bound to the candidates hook. */
export function CandidateReviewPanel({
  review,
  topics,
  selection,
  setsLoading,
  setsError,
  retrySets,
}: Readonly<{
  review: ReturnType<typeof usePromptCandidates>;
  topics: Topic[];
  selection: CandidateSelection;
  setsLoading?: boolean;
  setsError?: boolean;
  retrySets?: () => void;
}>) {
  if (setsLoading || review.isLoading) return <output>Loading suggestions…</output>;
  if (setsError || review.loadError)
    return (
      <Notice tone="negative">
        {review.loadError || "Couldn't load prompt sets."}
        <Button variant="secondary" onClick={setsError ? retrySets : review.retry}>
          Retry
        </Button>
      </Notice>
    );
  if (!review.candidates.length && !review.notice)
    return (
      <Notice tone="info">
        No pending suggestions remain. They may have expired or already been reviewed. Go Back to
        adjust the run and generate a new batch.
      </Notice>
    );
  return (
    <CandidateReview
      candidates={review.candidates}
      topics={topics}
      selection={selection}
      onReject={review.reject}
      isReviewing={review.isReviewing}
      error={review.error}
      notice={review.notice}
    />
  );
}

/**
 * How many generated prompts wait for review, and whether that is known yet.
 * The library holds its first paint until it is, so the notice never lands
 * above a table already on screen and pushes it down.
 */
export function usePendingReview({
  scope,
  promptSet,
  hidden,
}: Readonly<{ scope: ProjectScope; promptSet: PromptSet | null; hidden: boolean }>) {
  const pending = useQuery({
    ...promptsQueries.candidates(scope, promptSet?.id ?? null),
    enabled: !hidden,
  });
  return {
    count: hidden ? 0 : (pending.data?.length ?? 0),
    // No set, no candidates read: a disabled or skipped read stays pending.
    settled: hidden || promptSet === null || !pending.isPending,
  };
}

/** Library prompt that suggestions are waiting, linking to the Prompt builder's review step. */
export function PendingReviewNotice({ count }: Readonly<{ count: number }>) {
  if (!count) return null;
  return (
    <Notice tone="info">
      <Inline as="span" className="flex-wrap justify-between">
        {count === 1
          ? '1 generated prompt is waiting for review.'
          : `${count} generated prompts are waiting for review.`}
        <Button asChild variant="secondary">
          <ProjectLink href={PROMPT_BUILDER_REVIEW_HREF}>Review suggestions</ProjectLink>
        </Button>
      </Inline>
    </Notice>
  );
}
