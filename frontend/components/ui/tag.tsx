import { useId, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

import { ProjectLink } from '@/components/ui/project-link';
import { cn } from '@/lib/utils';

/**
 * The tag face: 24px tall, never wider than its container. In the app it is
 * `caption-strong` in `ink` at radius 4; a static tag is a `well` fill with no
 * edge, so it never looks operable; a tag you can operate (`OPERABLE_TAG`)
 * carries the solid control line and a draft the dashed one. The website
 * keeps its `caption`, radius 2 and `surface` face with a hairline.
 */
const TAG_FACE =
  'type-caption type-caption-strong text-ink bg-well border-transparent [[data-public-surface]_&]:bg-surface [[data-public-surface]_&]:border-rule border inline-flex min-h-[var(--tag-height)] max-w-full min-w-0 shrink-0 items-center gap-1 rounded-mark [:root:not([data-public-surface])_&]:rounded-sm px-2 normal-nums whitespace-nowrap';

/** The solid control line: this tag can be operated (a link, a remove, an expander). */
const OPERABLE_TAG = 'bg-surface border-control-line';

/**
 * What a tag is for. A status is a `StatusMark`, never
 * a Tag; tags are never coloured.
 *   - `category` (default): a topic, engine or kind, on the well.
 *   - `draft`: model-written and not yet accepted (law 1), dashed.
 *   - `removable`: an active filter or context chip, with a remove button
 *     named "Remove …".
 *   - `record`: one CiteLadder record named inside text (an Action in a
 *     reply), a link to its screen in this project, an optional status after
 *     its label.
 */
type TagKind =
  | { kind?: 'category' | 'draft' }
  | {
      kind: 'removable';
      onRemove: () => void;
      /** What the remove button removes, when the children are not plain text. */
      removeLabel?: string;
    };

type SpanProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & { children?: ReactNode };
type TagProps = Readonly<SpanProps & TagKind>;

/** The face and its one-line label, with an optional control at its end. */
function TagShell({
  kind,
  className,
  children,
  end,
  ...span
}: Readonly<SpanProps & { kind: 'category' | 'draft' | 'removable'; end?: ReactNode }>) {
  const text = typeof children === 'string' ? children : undefined;
  return (
    <span
      title={text}
      {...span}
      data-tag-kind={kind}
      className={cn(
        TAG_FACE,
        kind === 'draft' && 'bg-surface border-control-line border-dashed',
        kind === 'removable' && OPERABLE_TAG,
        kind === 'removable' && 'pe-0.5',
        className,
      )}
    >
      {text === undefined ? children : <span className="min-w-0 truncate">{text}</span>}
      {end}
    </span>
  );
}

/**
 * Tag — a short label. A text label is one line, cut with an ellipsis, its
 * full text in the tooltip; a tag whose children are not plain text cuts its
 * own label span (`min-w-0 truncate`).
 */
export function Tag(props: TagProps) {
  if (props.kind === 'removable') {
    const { kind, onRemove, removeLabel, ...span } = props;
    const text = typeof span.children === 'string' ? span.children : undefined;
    return (
      <TagShell
        {...span}
        kind={kind}
        end={
          <button
            type="button"
            aria-label={`Remove ${removeLabel ?? text ?? 'tag'}`}
            onClick={onRemove}
            className="focus-ring text-ink-2 hover:overlay-hover hover:text-ink rounded-mark relative grid size-5 place-items-center transition-colors before:absolute before:-inset-0.5 before:content-['']"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        }
      />
    );
  }
  const { kind = 'category', ...span } = props;
  return <TagShell {...span} kind={kind} />;
}

/**
 * RecordTag — the `record` tag: one record named inside text, linking to its
 * screen in this project, its label cutting before the optional status after
 * it (a `StatusMark`).
 */
export function RecordTag({
  href,
  label,
  status,
}: Readonly<{ href: string; label: string; status?: ReactNode }>) {
  return (
    <ProjectLink
      href={href}
      data-tag-kind="record"
      className={cn(
        TAG_FACE,
        OPERABLE_TAG,
        'focus-ring hover:overlay-hover align-middle no-underline',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {/* Read as two words; flex layout drops the space visually. */} {status}
    </ProjectLink>
  );
}

/** Two tags and a "+n" control that expands the rest in place, for touch and keyboard. */
export function TagGroup({ labels }: Readonly<{ labels: readonly string[] }>) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const visible = expanded ? labels : labels.slice(0, 2);
  return (
    // Folded, the two tags give way so "+n" stays on their line; open, the tags wrap.
    <div className={cn('flex min-w-0 items-center gap-1', expanded && 'flex-wrap')}>
      <span id={id} className="contents">
        {visible.map((label, index) => (
          <Tag key={`${index}:${label}`} className={expanded ? undefined : 'shrink'}>
            {label}
          </Tag>
        ))}
      </span>
      {labels.length > 2 ? (
        <button
          type="button"
          className={cn(TAG_FACE, OPERABLE_TAG, 'focus-ring hover:overlay-hover shrink-0')}
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={expanded ? undefined : `+${labels.length - 2} more tags`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `+${labels.length - 2}`}
        </button>
      ) : null}
    </div>
  );
}
