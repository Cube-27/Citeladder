'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { Input } from '@/components/ui/input';
import { listRowClasses } from '@/components/ui/list-row';
import { Select } from '@/components/ui/select';
import { Pressable } from '@/components/ui/pressable';
import { Tooltip } from '@/components/ui/tooltip';
import type { Topic } from '@/lib/api/types';
import { orderTopicsForRail } from '@/lib/prompts/topic-tree';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';

const TOPICS_LOAD_ERROR = "Couldn't load topics. Check your connection and try again.";

/** Resolve the topic error copy: load failures outrank action failures. */
function topicErrorMessage(loadError?: boolean, actionError?: string | null): string | null {
  if (loadError) return TOPICS_LOAD_ERROR;
  return actionError ?? null;
}

/**
 * Topics selection (prompt library). Two responsive variants sharing one
 * selection model:
 *  - Desktop (lg+): a contained `bg-panel` rail listing the
 *    project's topics with per-status counts, an "All topics" bucket, an inline
 *    add-topic form (optionally under a top-level topic, one level deep), and
 *    per-topic delete.
 *  - Narrow (< lg): a compact full-width Topics picker stacked above the
 *    status tabs — the desktop rail would crush the table, so the rail
 *    collapses to a selector, preserving the IA with no overlap.
 * Selection filters the prompt table; deleting a topic detaches its prompts
 * (backend `SET NULL`) — it never deletes them. Presentational — mutations
 * live in the library container.
 */
export function TopicRail({
  topics,
  selectedTopicId,
  onSelect,
  onCreate,
  onDelete,
  isCreating,
  loadError,
  actionError,
}: Readonly<{
  topics: Topic[];
  /** null = "All topics". */
  selectedTopicId: string | null;
  onSelect: (topicId: string | null) => void;
  /**
   * Create a topic, or a subtopic when `parentId` is set. Returning a promise
   * lets the rail keep the add form open (with the typed name intact) when
   * creation fails.
   */
  onCreate: (name: string, parentId: string | null) => Promise<void> | void;
  onDelete: (topic: Topic) => void;
  isCreating?: boolean;
  /** Set when the topics list failed to load. */
  loadError?: boolean;
  /** Rendered when a create/delete mutation fails. */
  actionError?: string | null;
}>) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  // Subtopics nest one level deep, so only top-level topics can be parents.
  const parents = topics.filter((topic) => !topic.parent_id);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await onCreate(trimmed, parentId || null);
      // Only reset on success — a failed create keeps the form open with the
      // typed name so the user can retry without re-typing.
      setName('');
      setParentId('');
      setAdding(false);
    } catch {
      // Error surfaced via `actionError`; leave the form populated.
    }
  };

  const errorBanner = topicErrorMessage(loadError, actionError) ? (
    <Alert tone="danger" className="mx-1">
      {topicErrorMessage(loadError, actionError)}
    </Alert>
  ) : null;

  return (
    <>
      {/* Desktop rail: raised surface that clips its own content
          so nothing from the right pane can overlap it. */}
      <Card className="hidden min-w-0 p-2 lg:block">
        <nav aria-label="Topics" className="grid min-w-0 content-start gap-1">
          <div className="flex items-center justify-between px-1">
            <h3 className={eyebrowClasses}>Topics</h3>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Add topic"
              onClick={() => setAdding((v) => !v)}
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </div>

          {errorBanner}

          {adding ? (
            <form
              className="grid gap-2 px-1 pb-1"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="flex items-center gap-2">
                <Input
                  // oxlint-disable-next-line jsx-a11y/no-autofocus -- Add topic explicitly opens this form; focus follows the invoking action.
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Topic name"
                  aria-label="Topic name"
                  className="h-8"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={isCreating || !name.trim()}
                >
                  Add
                </Button>
              </div>
              {parents.length ? (
                <Select
                  value={parentId}
                  onValueChange={setParentId}
                  ariaLabel="Add under"
                  className="w-full"
                  options={[
                    { value: '', label: 'Top-level topic' },
                    ...parents.map((topic) => ({
                      value: topic.id,
                      label: `Subtopic of ${topic.name}`,
                    })),
                  ]}
                />
              ) : null}
            </form>
          ) : null}

          <TopicItem
            label="All topics"
            selected={selectedTopicId === null}
            onSelect={() => onSelect(null)}
          />
          {orderTopicsForRail(topics).map(({ topic, nested, label }) => (
            <TopicItem
              key={topic.id}
              label={topic.name}
              accessibleName={nested ? label : undefined}
              nested={nested}
              activeCount={topic.active_count}
              selected={selectedTopicId === topic.id}
              onSelect={() => onSelect(topic.id)}
              onDelete={() => onDelete(topic)}
            />
          ))}
        </nav>
      </Card>

      {/* Narrow selector: full-width Topics picker shown below the lg
          breakpoint, stacked above the status tabs. */}
      <TopicSelect
        topics={topics}
        selectedTopicId={selectedTopicId}
        onSelect={onSelect}
        loadError={loadError}
        actionError={actionError}
      />
    </>
  );
}

/** Compact full-width Topics selector for narrow viewports (< lg). */
function TopicSelect({
  topics,
  selectedTopicId,
  onSelect,
  loadError,
  actionError,
}: Readonly<{
  topics: Topic[];
  selectedTopicId: string | null;
  onSelect: (topicId: string | null) => void;
  loadError?: boolean;
  actionError?: string | null;
}>) {
  const labelId = useId();
  return (
    <div className="grid gap-2 lg:hidden">
      <span id={labelId} className={eyebrowClasses}>
        Topics
      </span>
      <Select
        ariaLabel="Topics"
        aria-labelledby={labelId}
        value={selectedTopicId ?? ''}
        onValueChange={(value) => onSelect(value === '' ? null : value)}
        className="w-full"
        options={[
          { value: '', label: 'All topics' },
          ...orderTopicsForRail(topics).map(({ topic, label }) => ({ value: topic.id, label })),
        ]}
      />
      {topicErrorMessage(loadError, actionError) ? (
        <Alert tone="danger">{topicErrorMessage(loadError, actionError)}</Alert>
      ) : null}
    </div>
  );
}

function TopicItem({
  label,
  accessibleName,
  nested = false,
  activeCount,
  selected,
  onSelect,
  onDelete,
}: Readonly<{
  label: string;
  /** Parent-qualified name for a subtopic; top-level items use their text. */
  accessibleName?: string;
  nested?: boolean;
  activeCount?: number;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}>) {
  return (
    <div
      className={cn(
        'group flex min-w-0 items-center gap-0.5 pe-0.5',
        nested && 'ms-3',
        listRowClasses({ selected }),
      )}
    >
      <Pressable
        type="button"
        onClick={onSelect}
        aria-label={accessibleName}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left type-control',
          selected && textRole('emphasis'),
        )}
      >
        <Tooltip content={label}>
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </Tooltip>
        {typeof activeCount === 'number' ? (
          <span className="type-caption shrink-0 tabular-nums">{activeCount}</span>
        ) : null}
      </Pressable>
      {onDelete ? (
        <Button
          type="button"
          variant="destructiveGhost"
          size="icon"
          aria-label={`Delete topic ${accessibleName ?? label}`}
          onClick={onDelete}
          className="size-8 shrink-0"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
