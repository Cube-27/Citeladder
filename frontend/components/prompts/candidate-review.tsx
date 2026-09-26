'use client';

import { Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { textRole } from '@/components/ui/typography';
import type { PromptCandidate, Topic } from '@/lib/api/types';
import type { usePromptCandidates } from '@/lib/prompts/use-prompt-candidates';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Generated prompts awaiting review. Only accepted candidates become tracked
 * prompts; rejected ones are deleted. Selection is local and forgets ids that
 * are no longer pending.
 */
export function CandidateReview({
  candidates,
  topics,
  onAccept,
  onReject,
  isReviewing,
  error,
  notice,
}: Readonly<{
  candidates: PromptCandidate[];
  topics: Topic[];
  onAccept: (ids: string[]) => void;
  onReject: (ids: string[]) => void;
  isReviewing?: boolean;
  error?: string;
  notice?: string | null;
}>) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const selected = useMemo(
    () => candidates.filter((candidate) => picked.has(candidate.id)).map((c) => c.id),
    [candidates, picked],
  );
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
  const review = (action: (ids: string[]) => void) => {
    action(selected);
    setPicked(new Set());
  };

  return (
    <section aria-labelledby="candidate-review-heading" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="candidate-review-heading" className={textRole('bodyStrong')}>
          Review {plural(candidates.length, 'suggestion')}
        </h3>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => review(onReject)}
            disabled={isReviewing || selected.length === 0}
          >
            <X className="size-4" aria-hidden />
            Reject selected
          </Button>
          <Button
            variant="primary"
            onClick={() => review(onAccept)}
            disabled={isReviewing || selected.length === 0}
          >
            <Check className="size-4" aria-hidden />
            Accept selected
          </Button>
        </div>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <div className="bg-panel-tonal flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-1 py-1">
        <Checkbox
          label="Select all"
          checked={allState}
          onCheckedChange={(checked) =>
            setPicked(checked === true ? new Set(candidates.map((c) => c.id)) : new Set())
          }
          disabled={isReviewing}
        />
        <span className="text-muted text-xs tabular-nums">{selected.length} selected</span>
      </div>
      <ul className="grid min-w-0 gap-1" aria-label="Suggested prompts">
        {candidates.map((candidate) => {
          const topicName = candidate.topic_id ? topicNames.get(candidate.topic_id) : undefined;
          return (
            <li key={candidate.id} className="flex min-w-0 items-start gap-1">
              <Checkbox
                aria-label={`Select “${candidate.text}”`}
                checked={picked.has(candidate.id)}
                onCheckedChange={(checked) => toggle(candidate.id, checked === true)}
                disabled={isReviewing}
              />
              <div className="grid min-w-0 gap-0.5 py-2">
                <span className="text-foreground text-sm">{candidate.text}</span>
                {topicName ? <span className="text-muted text-xs">{topicName}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The review list for the Generate dialog, bound to the candidates hook. */
export function CandidateReviewPanel({
  review,
  topics,
}: Readonly<{ review: ReturnType<typeof usePromptCandidates>; topics: Topic[] }>) {
  return (
    <CandidateReview
      candidates={review.candidates}
      topics={topics}
      onAccept={review.accept}
      onReject={review.reject}
      isReviewing={review.isReviewing}
      error={review.error}
      notice={review.notice}
    />
  );
}

/** Library prompt that suggestions are waiting, while the dialog is closed. */
export function PendingReviewNotice({
  count,
  hidden,
  onReview,
}: Readonly<{ count: number; hidden: boolean; onReview: () => void }>) {
  if (!count || hidden) return null;
  return (
    <Alert tone="info">
      <span className="flex flex-wrap items-center justify-between gap-2">
        {count === 1
          ? '1 generated prompt is waiting for review.'
          : `${count} generated prompts are waiting for review.`}
        <Button variant="secondary" onClick={onReview}>
          Review suggestions
        </Button>
      </span>
    </Alert>
  );
}
