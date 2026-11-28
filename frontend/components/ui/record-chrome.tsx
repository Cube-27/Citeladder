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

export function RouteFill({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div data-route-fill="" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
    </div>
  );
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
      className="desktop:flex-row gap-page-top relative -mx-1 -mt-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-1 pt-1 outline-none"
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
      data-steps-nav=""
      className="desktop:sticky desktop:top-0 desktop:self-start w-section-rail flex shrink-0 flex-col"
    >
      <ol className="flex min-w-0 flex-col gap-1">{children}</ol>
      {note ? <p className="text-caption text-ink-2 px-2 pt-3">{note}</p> : null}
    </nav>
  );
}

export function StepsBody({
  label,
  narrow,
  children,
}: Readonly<{ label: string | undefined; narrow: boolean; children: ReactNode }>) {
  return (
    <section aria-label={label} className={cn('min-w-0 flex-1', narrow && 'max-w-form')}>
      {children}
    </section>
  );
}
