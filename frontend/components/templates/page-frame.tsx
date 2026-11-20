import { lazy, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { pageSection } from '@/components/layout/nav-items';
import { PageTitleContext } from '@/components/layout/page-title-context';
import { ShellContext } from '@/components/layout/shell-context';
import { NavMenuButton } from '@/components/ui/app-shell';
import type { Crumb } from '@/components/ui/breadcrumb';
import { LazyIsland } from '@/components/ui/lazy-island';
import { Masthead, usePublishedHeight } from '@/components/ui/masthead';
import { PageEmptyOfferProvider } from '@/components/ui/masthead-actions';
import { textRole } from '@/components/ui/typography';
import { resolveTitle, routeWidth } from '@/lib/navigation/app-routes';
import { routeTrail } from '@/lib/navigation/route-trail';
import { cn } from '@/lib/utils';

// Only record pages draw a trail, so it stays out of the boot bundle; a route's loading frame fetches it first.
const Breadcrumb = lazy(() =>
  import('@/components/ui/breadcrumb').then(({ Breadcrumb }) => ({ default: Breadcrumb })),
);

/** The slots every shell template shares (top to bottom). */
export type PageFrameSlots = Readonly<{
  /** The record's name or a screen's own title; else the route's manifest title. */
  title?: string;
  /** The steps above this page; else its route's collection. Empty: a top-level page. */
  trail?: readonly Crumb[];
  /** The page's own crumb when it differs from the title (a short path, a logo). */
  crumb?: Pick<Crumb, 'label' | 'mark'>;
  /** The header's own actions: secondary first, then at most one primary. */
  actions?: ReactNode;
  /** The tab strip: the page's sub-views. */
  tabs?: ReactNode;
  /** The toolbar strip: view switch, search and filters; the count and one action at its end. */
  filters?: ReactNode;
}>;

/** A strip across the panel's gutters, its content on the page column's edges. */
const STRIP =
  'border-rule flex min-w-0 border-b px-[calc(var(--page-pad-inline)+var(--page-start,0px))]';

/**
 * The anatomy every shell page shares (docs/design.md, Standard layouts):
 * the page header, then the optional tab strip (36) and toolbar strip (one
 * line of 28 controls, 8 above and below), each closed by a rule across the
 * whole panel and sticky under the header, then the body, 20 below the last
 * rule. A page passes content into the slots and sets no geometry of its own.
 * The header's title is the page's place: its nav section, then the title,
 * or for a record under its collection the trail, with the record's name as
 * the h1 above the strips. No page has a back arrow. The header's menu
 * button, search and "Ask agent" come from the shell and keep the panel's
 * right edge on every page. A narrow route (its manifest `width`) centres its
 * strips' content and body in `max-w-thread` (1040), a compact one in
 * `--container-prose` (720), and starts the header's title on that column's
 * edge; `fill` keeps a workbench across the panel. A page the panel scrolls
 * ends in `--page-end-space` of empty space; a `fitted` one (a thread, a
 * workbench) fills the panel and scrolls inside itself.
 */
export function PageFrame({
  title,
  trail,
  crumb,
  actions,
  tabs,
  filters,
  fill,
  fitted,
  width: ownWidth,
  children,
}: PageFrameSlots &
  Readonly<{
    fill?: true;
    fitted?: true;
    /** A view's own column, where it differs from its route's (one wide tab). */
    width?: PageWidth;
    children: ReactNode;
  }>) {
  const pathname = useLocation().pathname ?? '';
  const resolved = useRouteTitle(title, pathname);
  const parents = trail ?? routeTrail(pathname);
  const hasTrail = parents.length > 0;
  const width = pageWidth(pathname, { fill, own: ownWidth });
  const shell = useContext(ShellContext);
  const navDrawer = shell?.navDrawer;
  const searchParams = useSearchParams()[0];
  return (
    <PageEmptyOfferProvider>
      <div
        data-page-width={width}
        className={cn('flex min-w-0 flex-1 flex-col', PAGE_START[width])}
      >
        <Masthead
          title={resolved}
          section={pageSection(pathname, searchParams)}
          crumb={
            hasTrail ? (
              <LazyIsland failed={null} label="breadcrumb" defects="contain">
                <Breadcrumb parts={[...parents, crumb ?? { label: resolved }]} />
              </LazyIsland>
            ) : null
          }
          lead={
            navDrawer ? <NavMenuButton expanded={navDrawer.open} onOpen={navDrawer.onOpen} /> : null
          }
          search={shell?.searchTrigger}
          actions={actions}
          end={shell?.agentTrigger}
        />
        {hasTrail ? (
          <PageHeading
            title={resolved}
            strips={Boolean(tabs || filters)}
            className={PAGE_COLUMN[width]}
          />
        ) : null}
        {tabs || filters ? <PageStrips tabs={tabs} filters={filters} /> : null}
        <div
          data-page-body=""
          className={cn(
            'flex min-w-0 flex-1 flex-col pt-[var(--page-pad-block)]',
            PAGE_COLUMN[width],
            fitted ? 'pb-6' : 'pb-[var(--page-end-space)]',
          )}
        >
          {children}
        </div>
      </div>
    </PageEmptyOfferProvider>
  );
}

/**
 * A record page's h1, above its strips. Its height is published, so a fitted
 * page (a workbench, the prompt builder) still fills the window exactly.
 */
function PageHeading({
  title,
  strips,
  className,
}: Readonly<{ title: string; strips: boolean; className: string | false }>) {
  const block = useRef<HTMLDivElement>(null);
  usePublishedHeight(block, '--page-heading-block-size');
  return (
    <div
      ref={block}
      data-page-heading=""
      className={cn('min-w-0 pt-[var(--page-pad-block)]', strips && 'pb-3', className)}
    >
      <h1 className={textRole('title', 'break-words')}>{title}</h1>
    </div>
  );
}

/**
 * The tab strip, then the toolbar strip, pinned together under the header
 * (owner, 2026-11-19: "the tabs and filters rows should be sticky"). Their
 * height is published, so in-page scrolling and focus clear them.
 */
function PageStrips({ tabs, filters }: Pick<PageFrameSlots, 'tabs' | 'filters'>) {
  const strips = useRef<HTMLDivElement>(null);
  usePublishedHeight(strips, '--strips-block-size');
  return (
    <div
      ref={strips}
      data-page-strips=""
      className="bg-panel z-sticky sticky top-[var(--masthead-block-size,var(--masthead-height))] -mx-[var(--page-pad-inline)] flex min-w-0 flex-col"
    >
      {tabs ? (
        // The tabs fill the strip, so the current tab's mark sits on its rule.
        <div data-page-band="tabs" className={cn(STRIP, 'h-[var(--page-tabs-height)] items-end')}>
          {tabs}
        </div>
      ) : null}
      {filters ? (
        <div
          data-page-band="filters"
          className={cn(STRIP, 'min-h-[var(--filter-bar-height)] items-center py-2')}
        >
          {filters}
        </div>
      ) : null}
    </div>
  );
}

type PageWidth = ReturnType<typeof routeWidth>;

/** A workbench fills the panel; else the view's own column, else its route's. */
function pageWidth(pathname: string, view: { fill?: true; own?: PageWidth }): PageWidth {
  if (view.fill) return 'full';
  return view.own ?? routeWidth(pathname);
}

/** A narrow page's column: its record heading and body, centred in the panel. */
const PAGE_COLUMN: Record<PageWidth, string | false> = {
  full: false,
  narrow: 'max-w-thread mx-auto w-full',
  // `max-w-prose` is Tailwind's 65ch, not the 720 `--container-prose`.
  compact: 'mx-auto w-full max-w-[var(--container-prose)]',
};

/** Where the header's title and the strips' content start: on the page column's left edge. */
const PAGE_START: Record<PageWidth, string | false> = {
  full: false,
  narrow: '[--page-start:max(0px,calc((100cqw_-_var(--container-thread))/2))]',
  compact: '[--page-start:max(0px,calc((100cqw_-_var(--container-prose))/2))]',
};

/** The body's sections, 24 apart, on the one left edge. */
export function PageSections({
  className,
  children,
}: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <div
      data-page-content=""
      data-rhythm-gap="section"
      className={cn('flex min-w-0 flex-col gap-[var(--page-section-gap)]', className)}
    >
      {children}
    </div>
  );
}

/** The route's title, announced by the shell when a page overrides it. */
function useRouteTitle(title: string | undefined, pathname: string) {
  const setTitle = useContext(PageTitleContext);
  useLayoutEffect(() => {
    if (!setTitle || title === undefined) return;
    setTitle(title);
    return () => {
      setTitle((current) => (current === title ? undefined : current));
    };
  }, [setTitle, title]);
  return title ?? resolveTitle(pathname);
}
