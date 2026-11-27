import type { ReactNode, RefObject } from 'react';

import { cn } from '@/lib/utils';

export function RecordBody({
  busy,
  clearsBar,
  children,
}: Readonly<{ busy?: boolean; clearsBar: boolean; children: ReactNode }>) {
  return (
    <div
      aria-busy={busy}
      className={cn(
        'flex min-w-0 flex-1 flex-col',
        clearsBar && 'pb-[calc(var(--spacing-filter-bar)_+_2_*_var(--spacing-gutter))]',
      )}
    >
      {children}
    </div>
  );
}

export function ActionBar({
  sticky = false,
  children,
}: Readonly<{ sticky?: boolean; children: ReactNode }>) {
  return (
    <div
      data-page-band="action-bar"
      className={cn(
        'bg-raised border-rule rounded-card shadow-pop mt-workspace min-h-filter-bar px-card flex min-w-0 items-center gap-2 border py-2',
        sticky ? 'z-sticky bottom-gutter sticky flex-nowrap justify-end' : 'shrink-0 flex-wrap',
      )}
    >
      {children}
    </div>
  );
}

export function RouteFill({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="h-route-fill flex min-h-0 min-w-0 flex-col">{children}</div>;
}

export function StepsScroller({
  ref,
  children,
}: Readonly<{ ref: RefObject<HTMLDivElement | null>; children: ReactNode }>) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-quiet-focus=""
      data-page-scroller=""
      className="desktop:flex-row gap-page-top relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto outline-none"
    >
      {children}
    </div>
  );
}

export function StepsNav({
  label,
  note,
  children,
}: Readonly<{ label: string; note?: ReactNode; children: ReactNode }>) {
  return (
    <nav
      aria-label={label}
      className="desktop:sticky desktop:top-0 desktop:self-start w-section-rail flex shrink-0 flex-col"
    >
      <ol className="flex min-w-0 flex-col gap-1">{children}</ol>
      {note ? <p className="text-caption text-ink-2 px-2 pt-3">{note}</p> : null}
    </nav>
  );
}

export function StepsRowMark({
  state,
  children,
}: Readonly<{ state: 'done' | 'current' | 'next'; children: ReactNode }>) {
  return (
    <span
      aria-hidden
      className={cn(
        'text-caption text-ink-2',
        'grid size-4 shrink-0 place-items-center rounded-full tabular-nums',
        state === 'current' && 'border-mark-ink text-ink border',
        state === 'next' && 'border-control-line text-ink-2 border',
      )}
    >
      {children}
    </span>
  );
}
