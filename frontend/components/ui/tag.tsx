import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { ArrowRight, X } from 'lucide-react';

import { UrlCutParts } from '@/components/ui/clamp-text';
import { ProjectLink } from '@/components/ui/project-link';
import { cn } from '@/lib/utils';

const TAG_SHAPE =
  'type-caption border inline-flex min-h-[var(--tag-height)] max-w-full min-w-0 shrink-0 items-center gap-0.5 rounded-mark px-2 normal-nums whitespace-nowrap [[data-public-surface]_&]:bg-surface [[data-public-surface]_&]:border-rule [[data-public-surface]_&]:text-ink';

/**
 * The two tag looks, 24px tall, 12/16, radius 4, never wider than their
 * container. A static tag is a `well` fill with no edge in `ink-2`, so it
 * never looks operable. The website keeps its radius 2 `surface` face with a
 * hairline.
 */
const TAG_STATIC = cn(TAG_SHAPE, 'bg-well border-transparent text-ink-2');

/**
 * A tag you can operate (a link, a remove, an expander): `control-fill` with the
 * soft control edge and shadow, `ink` text, the 6% ink hover. A link tag ends
 * in a 12px arrow (`ArrowRight` for an app route).
 */
const OPERABLE_FACE = cn(TAG_SHAPE, 'bg-control-fill border-control-edge shadow-control text-ink');
const TAG_OPERABLE = cn(OPERABLE_FACE, 'hover:overlay-hover');

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
        // A removable tag's operable part is its remove button, which takes the hover.
        kind === 'removable' ? cn(OPERABLE_FACE, 'pe-0.5') : TAG_STATIC,
        kind === 'draft' && 'bg-surface border-control-line border-dashed',
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
 * it (a `StatusMark`). A `url` label cuts its middle and keeps its tail; the
 * link's name is the whole label either way.
 */
export function RecordTag({
  href,
  label,
  labelKind = 'text',
  status,
}: Readonly<{ href: string; label: string; labelKind?: 'text' | 'url'; status?: ReactNode }>) {
  return (
    <ProjectLink
      href={href}
      data-tag-kind="record"
      className={cn(TAG_OPERABLE, 'focus-ring align-middle no-underline')}
    >
      {labelKind === 'url' ? (
        <span className="flex min-w-0">
          <UrlCutParts text={label} />
        </span>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
      {/* Read as two words; flex layout drops the space visually. */} {status}
      <ArrowRight className="size-3 shrink-0" aria-hidden />
    </ProjectLink>
  );
}
