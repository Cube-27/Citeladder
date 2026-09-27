import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { httpErrorStatus, humanizeApiError } from '@/lib/api/errors';
import type { PromptGenerateResponse, Topic } from '@/lib/api/types';
import { orderTopicsForRail } from '@/lib/prompts/topic-tree';
import { textRole } from '@/components/ui/typography';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function GenerateResultAlert({ result }: Readonly<{ result: PromptGenerateResponse }>) {
  const total = result.candidates.length;
  const topicCount = new Set(
    result.candidates
      .map((candidate) => candidate.topic_id)
      .filter((id): id is string => id != null),
  ).size;
  const duplicates = result.dropped_duplicates
    ? `; ${plural(result.dropped_duplicates, 'duplicate')} skipped`
    : '';
  // Say so when the request could not be filled, rather than letting a short
  // set read as the number that was asked for.
  const shortfall =
    result.requested_count > total
      ? ` (${total} of ${result.requested_count} requested — add topics for more)`
      : '';
  const judge =
    result.quality_gate === 'unavailable'
      ? ' Quality checks may have been unavailable for some suggestions, so an unflagged row may not have been checked.'
      : '';
  return (
    <Alert tone="success">
      Drafted {plural(total, 'suggestion')}
      {shortfall}
      {topicCount ? ` across ${plural(topicCount, 'topic')}` : ''}
      {duplicates}. Accept the ones worth tracking.{judge}
    </Alert>
  );
}

function GenerateErrorAlert({ error }: Readonly<{ error: unknown }>) {
  const status = httpErrorStatus(error);
  if (status === 429) {
    const retryAfter = humanizeApiError(error).retryAfterSeconds;
    return (
      <Alert tone="warning">
        The AI provider is rate limited. Try again
        {retryAfter ? ` in about ${retryAfter} seconds` : ' in a moment'}.
      </Alert>
    );
  }
  if (status === 503) {
    return (
      <Alert tone="warning">
        No AI provider is configured. Set <code>DEFAULT_AGENT_API_KEY</code> (and optionally{' '}
        <code>DEFAULT_AGENT_BASE_URL</code> / <code>DEFAULT_AGENT_MODEL</code>) in the backend
        environment, then try again.
      </Alert>
    );
  }
  if (status === 502)
    return (
      <Alert tone="danger">
        The AI provider call failed or returned unusable output. Try again in a moment.
      </Alert>
    );
  return (
    <Alert tone="danger">
      {error instanceof Error && error.message
        ? error.message
        : 'Generation failed. Please try again.'}
    </Alert>
  );
}

export function GeneratePromptsDialogView({
  open,
  onOpenChange,
  topics,
  count,
  selectedTopicIds,
  setCount,
  toggleTopic,
  countValid,
  onSubmit,
  isGenerating,
  error,
  result,
  maxCount,
  review,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: Topic[];
  count: string;
  /** Selected topics; empty means every topic. */
  selectedTopicIds: ReadonlySet<string>;
  setCount: (value: string) => void;
  toggleTopic: (id: string, checked: boolean) => void;
  countValid: boolean;
  onSubmit: () => void;
  isGenerating?: boolean;
  error?: unknown;
  result?: PromptGenerateResponse | null;
  maxCount: number;
  /** The pending-candidate review list, when there is anything to review. */
  review?: ReactNode;
}>) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate prompts"
      description="CiteLadder drafts prompt suggestions for you to review and creates starting topics from confirmed offerings when needed. Only accepted prompts are tracked."
      className={review ? 'w-180' : 'w-130'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={isGenerating || !countValid}>
            <Sparkles className="size-4" aria-hidden />
            {isGenerating ? 'Generating…' : 'Generate'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {topics.length === 0 ? (
          <Alert tone="info">
            No topics exist yet. CiteLadder will create them from your confirmed offerings, then
            generate prompts.
          </Alert>
        ) : null}
        {error ? <GenerateErrorAlert error={error} /> : null}
        {result && !error ? <GenerateResultAlert result={result} /> : null}
        <div className="grid gap-1.5">
          <span className={textRole('label')}>Number of prompts (1–{maxCount})</span>
          <Input
            type="number"
            min={1}
            max={maxCount}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            aria-label="Number of prompts"
            aria-invalid={!countValid}
          />
        </div>
        {topics.length > 0 ? (
          <fieldset className="grid min-w-0 gap-1.5">
            <legend className={textRole('label')}>Topics</legend>
            <span className="text-muted text-xs">
              {selectedTopicIds.size
                ? `${plural(selectedTopicIds.size, 'topic')} selected.`
                : 'None selected: suggestions cover every topic.'}
            </span>
            <div className="grid max-h-48 min-w-0 overflow-y-auto">
              {orderTopicsForRail(topics).map(({ topic, nested }) => (
                <Checkbox
                  key={topic.id}
                  label={topic.name}
                  className={nested ? 'ms-6' : undefined}
                  checked={selectedTopicIds.has(topic.id)}
                  onCheckedChange={(checked) => toggleTopic(topic.id, checked === true)}
                  disabled={isGenerating}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        {review}
      </div>
    </Dialog>
  );
}
