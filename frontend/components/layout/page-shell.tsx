import type { ReactNode, RefObject } from 'react';

import { PageFrame, type PageBack } from '@/components/templates/page-frame';
import { AppGrid } from '@/components/ui/app-grid';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { TabRow, type TabRowProps } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { StateBlock } from '@/components/ui/state-block';

export type { PageBack };

/**
 * The screens not yet moved onto a template (components/templates) draw
 * through these, on the same frame: the masthead, the page tabs band, the
 * filter bar band, then the content 24 below. A route passes data, organisms
 * and slots and adds no margins between bands.
 */
type ScreenBands<T extends string> = Readonly<{
  /** Overrides the route-derived title (a record's own name). */
  title?: string;
  /** Route-owned controls; their state and outcomes stay with the route owner. */
  actions?: ReactNode;
  /** The route's tabs, drawn as the `TabRow`; the route owns the `TabsRoot`. */
  tabs?: TabRowProps<T>;
  /** The selected tab's control row, drawn as the `FilterBar`. */
  controls?: FilterBarProps;
  children?: ReactNode;
}>;

/**
 * A screen that fills the viewport below the masthead: the content scrolls in
 * its own region and `dock` stays under it, so the window and the dock never
 * move while the content grows. `scrollRef` reaches the scrolling region;
 * `scrollLabel` names it when it holds a conversation.
 */
type FillLayout =
  | Readonly<{ fill?: false; dock?: never; scrollRef?: never; scrollLabel?: never }>
  | Readonly<{
      fill: true;
      dock?: ReactNode;
      scrollRef?: RefObject<HTMLElement | null>;
      scrollLabel?: string;
    }>;

/** `narrow` holds the tabs, controls and content to the thread width on the one left edge. */
type NarrowLayout = Readonly<{ narrow?: boolean }>;

/** ListScreen — a collection, dashboard or workspace route. */
export function ListScreen<T extends string = string>(
  props: ScreenBands<T> & FillLayout & Readonly<{ back?: PageBack }> & NarrowLayout,
) {
  return <PageShell {...props} />;
}

/**
 * The control band, held while the route's filters wait on their first read.
 * A loading frame passes it as `controls` when the loaded page will have a
 * control band, so the work below starts on the same line in both frames.
 */
export const RESERVED_CONTROLS: FilterBarProps = {};

/**
 * RouteLoadingScreen — the frame a route shows before its own page can draw:
 * the masthead (its title comes from the path) and one loading block where
 * the content begins.
 */
export function RouteLoadingScreen({ label }: Readonly<{ label?: string }>) {
  return (
    <ListScreen>
      <StateBlock kind="loading" label={label} />
    </ListScreen>
  );
}

/**
 * DetailScreen — one record: the back link before its name, optional tabs or
 * controls, then the content: one stack, the main column beside its `aside`,
 * or, with `column`, one column at the thread width.
 */
export function DetailScreen<T extends string = string>({
  back,
  lead,
  aside,
  column = false,
  children,
  ...bands
}: ScreenBands<T> &
  Readonly<{
    back: PageBack;
    /** The record's summary (its URL, status line), full width above the split. */
    lead?: ReactNode;
    /** Supporting context beside the main content. */
    aside?: ReactNode;
    /** One column at the thread width instead of the full width. */
    column?: boolean;
  }>) {
  return (
    <PageShell {...bands} back={back}>
      {lead}
      <DetailContent column={column} aside={aside}>
        {children}
      </DetailContent>
    </PageShell>
  );
}

function DetailContent({
  column,
  aside,
  children,
}: Readonly<{ column: boolean; aside: ReactNode; children: ReactNode }>) {
  if (column)
    return (
      <div className="max-w-thread flex w-full min-w-0 flex-col gap-[var(--page-section-gap)]">
        {children}
      </div>
    );
  if (!aside) return children;
  return (
    <AppGrid layout="main-aside">
      <div className="flex min-w-0 flex-col gap-[var(--workspace-gap)]">{children}</div>
      <aside className="flex min-w-0 flex-col gap-[var(--workspace-gap)]">{aside}</aside>
    </AppGrid>
  );
}

function PageShell<T extends string>({
  title,
  back,
  actions,
  tabs,
  controls,
  narrow = false,
  children,
  ...layout
}: ScreenBands<T> & FillLayout & Readonly<{ back?: PageBack }> & NarrowLayout) {
  return (
    <PageFrame
      title={title}
      back={back}
      actions={actions}
      tabs={tabs ? <TabRow {...tabs} /> : undefined}
      filters={controls ? <FilterBar {...controls} /> : undefined}
    >
      <div className={cn('flex min-w-0 flex-1 flex-col', narrow && 'max-w-thread w-full')}>
        <PageContent {...layout}>{children}</PageContent>
      </div>
    </PageFrame>
  );
}

/**
 * The content band: its sections stack 32 apart, like `PageSections`. A fill screen's content is
 * exactly the viewport left below the masthead, so the window never scrolls.
 */
function PageContent({ children, ...layout }: FillLayout & Readonly<{ children: ReactNode }>) {
  if (!layout.fill) {
    return (
      <div data-page-content="" className="flex min-w-0 flex-col gap-[var(--page-section-gap)]">
        {children}
      </div>
    );
  }
  return (
    <FillContent dock={layout.dock} scrollRef={layout.scrollRef} scrollLabel={layout.scrollLabel}>
      {children}
    </FillContent>
  );
}

function FillContent({
  dock,
  scrollRef,
  scrollLabel,
  children,
}: Readonly<{
  dock: ReactNode;
  scrollRef: RefObject<HTMLElement | null> | undefined;
  scrollLabel: string | undefined;
  children: ReactNode;
}>) {
  return (
    <div className="flex h-[calc(100dvh-var(--route-chrome-height))] min-h-0 flex-col gap-[var(--workspace-gap)]">
      <section
        ref={scrollRef}
        aria-label={scrollLabel}
        className="min-h-0 flex-1 [scrollbar-gutter:stable_both-edges] overflow-y-auto overscroll-contain"
      >
        <div
          data-page-content=""
          className="flex min-h-full min-w-0 flex-col gap-[var(--page-section-gap)]"
        >
          {children}
        </div>
      </section>
      {dock}
    </div>
  );
}
