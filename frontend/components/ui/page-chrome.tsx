import type { ReactNode, Ref, RefObject } from 'react';

import { SectionStack } from '@/components/ui/section';
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
  return <SectionStack data-page-content="">{children}</SectionStack>;
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
