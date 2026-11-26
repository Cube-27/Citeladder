import type { ReactNode, Ref, RefObject } from 'react';

import { TAB_BASELINE } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type PageWidth = 'full' | 'narrow' | 'compact' | 'fill';

const PAGE_START: Record<PageWidth, string | false> = {
  fill: false,
  full: 'page-start-full',
  narrow: 'page-start-narrow',
  compact: 'page-start-compact',
};

const PAGE_COLUMN: Record<PageWidth, string | false> = {
  fill: false,
  full: 'ms-page-start w-full max-w-app',
  narrow: 'ms-page-start w-full max-w-page',
  compact: 'ms-page-start w-full max-w-measure',
};

export function PageWidthFrame({
  width,
  children,
}: Readonly<{ width: PageWidth; children: ReactNode }>) {
  return (
    <div data-page-width={width} className={cn('flex min-w-0 flex-1 flex-col', PAGE_START[width])}>
      {children}
    </div>
  );
}

export function PageHeadingRow({
  width,
  strips,
  ref,
  children,
}: Readonly<{
  width: PageWidth;
  strips: boolean;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}>) {
  return (
    <div
      ref={ref}
      data-page-heading=""
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 pt-page-block',
        strips && 'pb-3',
        PAGE_COLUMN[width],
      )}
    >
      {children}
    </div>
  );
}

export function PageTitle({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <h1 className="text-page-title text-ink min-h-control-md flex min-w-0 items-center break-words">
      {children}
    </h1>
  );
}

const STRIP = 'flex min-w-0 px-page-strip';

export function PageTabBand({
  endRef,
  children,
}: Readonly<{ endRef: (slot: HTMLElement | null) => void; children: ReactNode }>) {
  return (
    <div data-page-band="tabs" className={cn(STRIP, 'h-page-tabs items-end')}>
      <div className={cn('flex min-w-0 flex-1 items-end gap-4', TAB_BASELINE)}>
        {children}
        <div
          ref={endRef}
          data-page-tab-end=""
          className="text-caption text-ink-2 ms-auto flex min-w-0 items-center gap-3 self-stretch overflow-hidden whitespace-nowrap empty:hidden"
        />
      </div>
    </div>
  );
}

export function PageFilterBand({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div data-page-band="filters" className={cn(STRIP, 'items-center')}>
      {children}
    </div>
  );
}

export function PageBody({
  width,
  end,
  children,
}: Readonly<{ width: PageWidth; end: 'page' | 'thread'; children: ReactNode }>) {
  return (
    <div
      data-page-body=""
      className={cn(
        'flex min-w-0 flex-1 flex-col pt-3',
        PAGE_COLUMN[width],
        end === 'thread' ? 'pb-1' : 'pb-6',
      )}
    >
      {children}
    </div>
  );
}

export function PageSections({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div data-page-content="" className="gap-section flex min-w-0 flex-col">
      {children}
    </div>
  );
}

export function RecordBody({
  busy,
  clearsBar,
  children,
}: Readonly<{ busy?: boolean; clearsBar: boolean; children: ReactNode }>) {
  return (
    <div
      aria-busy={busy}
      className={cn('flex min-w-0 flex-1 flex-col', clearsBar && 'pb-bar-clearance')}
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

export function RailColumns({
  rail,
  children,
}: Readonly<{ rail: ReactNode; children: ReactNode }>) {
  return (
    <div data-section-rail="" className="desktop:flex-row gap-page-top flex min-w-0 flex-col">
      <div className="desktop:sticky desktop:top-rail-top desktop:w-48 desktop:self-start shrink-0">
        {rail}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
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
      className="desktop:sticky desktop:top-0 desktop:self-start flex w-56 shrink-0 flex-col"
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

export function ThreadLayout({
  scrollRef,
  scrollLabel,
  composer,
  children,
}: Readonly<{
  scrollRef?: RefObject<HTMLElement | null>;
  scrollLabel?: string;
  composer?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="gap-workspace h-thread-fill flex min-h-0 flex-col">
      <section
        ref={scrollRef}
        aria-label={scrollLabel}
        className="scrollbar-stable min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
      >
        <div
          data-page-content=""
          data-thread=""
          className="gap-workspace flex min-h-full w-full min-w-0 flex-col"
        >
          {children}
        </div>
      </section>
      {composer ? <div className="w-full min-w-0 px-1">{composer}</div> : null}
    </div>
  );
}
