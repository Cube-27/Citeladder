import { lazy, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

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
  /** The masthead's own actions: secondary first, then at most one primary. */
  actions?: ReactNode;
  /** The tab strip: the page's sub-views. */
  tabs?: ReactNode;
  /** The filter strip: view switch, search and filters; meta, count and export at its end. */
  filters?: ReactNode;
}>;

/**
 * A strip's `ground` and closing hairline, across the whole main column like
 * the masthead's, so a narrow page's strips still span it and content
 * scrolls under them unseen.
 */
const STRIP_RULE =
  'before:bg-ground before:border-rule relative isolate min-w-0 before:absolute before:inset-x-[calc(50%_-_50cqw_-_var(--content-gutter))] before:inset-y-0 before:-z-10 before:border-b';

/**
 * The anatomy every shell page shares (owner, 2026-11-18): the masthead
 * strip, then the optional tab strip and filter strip (8 around 32 controls,
 * one line), both 48 high and each closed by a hairline across the main
 * column, then the body `--page-pad-block` below. A page passes content into
 * the slots and sets no strip geometry of its own. One rule for the title
 * (owner, 2026-11-19): a page with a trail (a record under its collection)
 * draws the breadcrumb in the masthead and its title as the h1 above the
 * strips; a top-level page's masthead holds its title. No page has a back
 * arrow. The masthead's
 * menu button, search and "Ask agent" come from the shell; the page's
 * actions sit just left of them, and they keep the main column's right edge
 * on every page (owner, 2026-11-19). A narrow route (its
 * manifest `width`) centres its strips and body in `max-w-thread`, a compact
 * one in `--container-prose`, and starts the masthead's title on that column's
 * edge; `fill` keeps a workbench across the main column. A page the window scrolls ends in
 * `--page-end-space` of empty space; a `fitted` one (a thread, a workbench)
 * fills the window and scrolls inside itself, so it has none.
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
  children,
}: PageFrameSlots & Readonly<{ fill?: true; fitted?: true; children: ReactNode }>) {
  const pathname = useLocation().pathname ?? '';
  const resolved = useRouteTitle(title, pathname);
  const parents = trail ?? routeTrail(pathname);
  const hasTrail = parents.length > 0;
  const width = fill ? 'full' : routeWidth(pathname);
  const shell = useContext(ShellContext);
  const navDrawer = shell?.navDrawer;
  return (
    <PageEmptyOfferProvider>
      <div
        data-page-width={width}
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          PAGE_START[width],
          !fitted && 'pb-[var(--page-end-space)]',
        )}
      >
        <Masthead
          title={resolved}
          crumb={
            hasTrail ? (
              <LazyIsland failed={null} label="breadcrumb" defects="contain">
                <Breadcrumb parts={[...parents, crumb ?? { label: resolved }]} />
              </LazyIsland>
            ) : null
          }
          lead={
            <>
              {shell?.sidebarToggle}
              {navDrawer ? (
                <NavMenuButton expanded={navDrawer.open} onOpen={navDrawer.onOpen} />
              ) : null}
            </>
          }
          search={shell?.searchTrigger}
          actions={actions}
          end={shell?.agentTrigger}
        />
        <div className={cn('flex min-w-0 flex-1 flex-col', PAGE_COLUMN[width])}>
          {hasTrail ? <PageHeading title={resolved} strips={Boolean(tabs || filters)} /> : null}
          {tabs || filters ? <PageStrips tabs={tabs} filters={filters} /> : null}
          <div
            data-page-body=""
            className="flex min-w-0 flex-1 flex-col pt-[var(--page-pad-block)]"
          >
            {children}
          </div>
        </div>
      </div>
    </PageEmptyOfferProvider>
  );
}

/**
 * A record page's h1, above its strips. Its height is published, so a fitted
 * page (a workbench, the prompt builder) still fills the window exactly.
 */
function PageHeading({ title, strips }: Readonly<{ title: string; strips: boolean }>) {
  const block = useRef<HTMLDivElement>(null);
  usePublishedHeight(block, '--page-heading-block-size');
  return (
    <div
      ref={block}
      data-page-heading=""
      className={cn('min-w-0 pt-[var(--page-pad-block)]', strips && 'pb-[var(--workspace-gap)]')}
    >
      <h1 className={textRole('title', 'break-words')}>{title}</h1>
    </div>
  );
}

/**
 * The tab strip, then the filter strip, pinned together under the masthead
 * on `ground` (owner, 2026-11-19: "the tabs and filters rows should be
 * sticky"). Their height is published, so in-page scrolling and focus clear them.
 */
function PageStrips({ tabs, filters }: Pick<PageFrameSlots, 'tabs' | 'filters'>) {
  const strips = useRef<HTMLDivElement>(null);
  usePublishedHeight(strips, '--strips-block-size');
  return (
    <div
      ref={strips}
      data-page-strips=""
      className="z-sticky sticky top-[var(--masthead-block-size,var(--masthead-height))] flex min-w-0 flex-col"
    >
      {tabs ? (
        // The tabs fill the strip, so the current tab's underline sits on its rule.
        <div data-page-band="tabs" className={cn(STRIP_RULE, 'flex items-end')}>
          {tabs}
        </div>
      ) : null}
      {filters ? (
        <div data-page-band="filters" className={cn(STRIP_RULE, 'flex items-center py-2')}>
          {filters}
        </div>
      ) : null}
    </div>
  );
}

type PageWidth = ReturnType<typeof routeWidth>;

/** A narrow page's column: the strips and body, centred in the main column. */
const PAGE_COLUMN: Record<PageWidth, string | false> = {
  full: false,
  narrow: 'max-w-thread mx-auto w-full',
  // `max-w-prose` is Tailwind's 65ch, not the 720 `--container-prose`.
  compact: 'mx-auto w-full max-w-[var(--container-prose)]',
};

/** Where the masthead's title starts: on the page column's left edge. */
const PAGE_START: Record<PageWidth, string | false> = {
  full: false,
  narrow: '[--page-start:max(0px,calc((100%_-_var(--container-thread))/2))]',
  compact: '[--page-start:max(0px,calc((100%_-_var(--container-prose))/2))]',
};

/** The body's sections on the page surface, 32 apart, on the one left edge. */
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
