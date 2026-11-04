'use client';

import { useId, useState, type ComponentPropsWithoutRef } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/** The tag face: 24px, 12px medium `ink` on `surface` with the xs ring, `radius-xs`. */
export const TAG_FACE =
  'bg-surface text-ink shadow-xs inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-xs px-2 text-caption font-medium whitespace-nowrap';

/**
 * Tag — a neutral chip for a topic, engine or active filter, optionally
 * removable (`onRemove` adds a remove button named "Remove …"). Status is a
 * `Badge`, never a Tag; tags are never coloured and never buttons.
 */
export function Tag({
  className,
  children,
  onRemove,
  removeLabel,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'span'> & {
    onRemove?: () => void;
    /** What the remove button removes, when the children are not plain text. */
    removeLabel?: string;
  }
>) {
  return (
    <span {...props} className={cn(TAG_FACE, onRemove && 'pe-0.5', className)}>
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${removeLabel ?? (typeof children === 'string' ? children : 'tag')}`}
          onClick={onRemove}
          className="focus-ring text-ink-muted hover:bg-surface-sunken hover:text-ink grid size-5 place-items-center rounded-xs transition-colors"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/** Two tags and a "+n" control that expands the rest in place, for touch and keyboard. */
export function TagGroup({ labels }: Readonly<{ labels: readonly string[] }>) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const visible = expanded ? labels : labels.slice(0, 2);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <span id={id} className="contents">
        {visible.map((label, index) => (
          <Tag key={`${index}:${label}`}>{label}</Tag>
        ))}
      </span>
      {labels.length > 2 ? (
        <button
          type="button"
          className={cn(TAG_FACE, 'focus-ring hover:bg-surface-sunken')}
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={expanded ? 'Show fewer tags' : `Show ${labels.length - 2} more tags`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : <span className="font-mono">{`+${labels.length - 2}`}</span>}
        </button>
      ) : null}
    </div>
  );
}
