import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { UrlCutParts } from '@/components/ui/clamp-text';
import { TAG_FACE } from '@/components/ui/link-look';
import { ProjectLink } from '@/components/ui/project-link';
import { ArrowRight, X } from '@/lib/icons';
import { cn } from '@/lib/utils';

type TagKind =
  | { kind?: 'category' | 'draft' }
  | {
      kind: 'removable';
      onRemove: () => void;
      removeLabel?: string;
    };

type SpanProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  children?: ReactNode;
  strong?: boolean;
};
type TagProps = Readonly<SpanProps & TagKind>;

function TagShell({
  kind,
  className,
  children,
  end,
  strong = false,
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
        kind === 'removable' && 'pe-0.5',
        kind === 'draft' && 'border-control-line border-dashed',
        className,
        strong && 'text-ink font-emphasis',
      )}
    >
      {text === undefined ? children : <span className="min-w-0 truncate">{text}</span>}
      {end}
    </span>
  );
}

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
            className="focus-ring text-ink-2 hover:overlay-hover hover:text-ink rounded-mark hit-area grid size-4 place-items-center transition-colors"
          >
            <X className="size-3" aria-hidden />
          </button>
        }
      />
    );
  }
  const { kind = 'category', ...span } = props;
  return <TagShell {...span} kind={kind} />;
}

export function RecordTag({
  href,
  label,
  labelKind = 'text',
  status,
}: Readonly<{ href: string; label: string; labelKind?: 'text' | 'url'; status?: ReactNode }>) {
  return (
    <ProjectLink href={href} data-tag-kind="record" look="tag">
      {labelKind === 'url' ? (
        <span className="flex min-w-0">
          <UrlCutParts text={label} />
        </span>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}{' '}
      {status}
      <ArrowRight className="size-3 shrink-0" aria-hidden />
    </ProjectLink>
  );
}
