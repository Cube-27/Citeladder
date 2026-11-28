import type { ReactNode, Ref, RefObject } from 'react';

import { SectionStack } from '@/components/ui/section';
import { TAB_BASELINE } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type PageWidth = 'full' | 'narrow' | 'detail' | 'reading' | 'fill';

const PAGE_START: Record<PageWidth, string | false> = {
  fill: false,
  full: 'page-start-full',
  narrow: 'page-start-narrow',
  detail: 'page-start-detail',
  reading: 'page-start-reading',
};

const PAGE_COLUMN: Record<PageWidth, string | false> = {
  fill: false,
  full: 'ms-[var(--page-start,0px)] w-full max-w-app',
  narrow: 'ms-[var(--page-start,0px)] w-full max-w-page',
  detail: 'ms-[var(--page-start,0px)] w-full max-w-detail',
  reading: 'ms-[var(--page-start,0px)] w-full max-w-reading',
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

const STRIP = 'flex min-w-0 px-[calc(var(--spacing-page-inline)_+_var(--page-start,0px))]';

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

const RAIL_SECTION = { reading: 'max-w-reading', fill: false } as const;

export type RailSection = keyof typeof RAIL_SECTION;

export function RailColumns({
  rail,
  section,
  children,
}: Readonly<{ rail: ReactNode; section: RailSection; children: ReactNode }>) {
  return (
    <div data-section-rail="" className="desktop:flex-row gap-page-top flex min-w-0 flex-col">
      <div className="desktop:sticky desktop:top-[calc(var(--masthead-block-size,var(--spacing-masthead))_+_var(--spacing-page-block))] desktop:w-section-rail desktop:self-start shrink-0">
        {rail}
      </div>
      <div data-rail-section={section} className={cn('min-w-0 flex-1', RAIL_SECTION[section])}>
        {children}
      </div>
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
    <div className="flex flex-1 flex-col">
      <section
        ref={scrollRef}
        aria-label={scrollLabel}
        className="pb-workspace flex flex-1 flex-col p-1"
      >
        <div
          data-page-content=""
          data-thread=""
          className="gap-workspace flex w-full min-w-0 flex-1 flex-col"
        >
          {children}
        </div>
      </section>
      {composer ? (
        <div className="bg-page z-sticky sticky bottom-0 w-full min-w-0">{composer}</div>
      ) : null}
    </div>
  );
}
