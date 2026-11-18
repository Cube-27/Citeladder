import { useContext, useLayoutEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { PageTitleContext } from '@/components/layout/page-title-context';
import { ShellContext } from '@/components/layout/shell-context';
import { NavMenuButton } from '@/components/ui/app-shell';
import { Masthead, MastheadBack } from '@/components/ui/masthead';
import { PageEmptyOfferProvider } from '@/components/ui/masthead-actions';
import { resolveTitle, routeWidth } from '@/lib/navigation/app-routes';
import { cn } from '@/lib/utils';

/** A record page's way back to the collection it belongs to. */
export type PageBack = Readonly<{
  /** The collection route, e.g. `/runs`; scoped to the project like any app link. */
  href: string;
  /** The link's accessible name and hint, e.g. "Back to runs". */
  label: string;
  /** Scope to this project rather than the active one. */
  projectId?: string | null;
}>;

/** The slots every shell template shares (top to bottom). */
export type PageFrameSlots = Readonly<{
  /** The record's name or a screen's own title; else the route's manifest title. */
  title?: string;
  /** A record page's back link to its collection. */
  back?: PageBack;
  /** A breadcrumb drawn in the masthead instead of the title; the body holds the h1. */
  crumb?: ReactNode;
  /** The masthead's own actions: secondary first, then at most one primary. */
  actions?: ReactNode;
  /** The tab strip: the page's sub-views. */
  tabs?: ReactNode;
  /** The filter strip: view switch, search and filters; meta, count and export at its end. */
  filters?: ReactNode;
}>;

/**
 * A strip's closing hairline, across the whole main column like the
 * masthead's, so a narrow page's strips still span it.
 */
const STRIP_RULE =
  'before:border-rule relative isolate min-w-0 before:absolute before:inset-x-[calc(50%_-_50cqw_-_var(--content-gutter))] before:inset-y-0 before:-z-10 before:border-b';

/**
 * The anatomy every shell page shares (owner, 2026-11-18): the masthead
 * strip, then the optional tab strip and filter strip (8 around 32 controls,
 * one line), both 48 high and each closed by a hairline across the main
 * column, then the body `--page-pad-block` below. A page passes content into
 * the slots and sets no strip geometry of its own. The masthead's
 * menu button, search and "Ask agent" come from the shell. A narrow route (its manifest `width`) centres the whole frame, title and
 * actions included, in the chat's `max-w-thread`; `fill` keeps a workbench
 * across the main column. A page the window scrolls ends in
 * `--page-end-space` of empty space; a `fitted` one (a thread, a workbench)
 * fills the window and scrolls inside itself, so it has none.
 */
export function PageFrame({
  title,
  back,
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
  const width = fill ? 'full' : routeWidth(pathname);
  const shell = useContext(ShellContext);
  const navDrawer = shell?.navDrawer;
  return (
    <PageEmptyOfferProvider>
      <div
        data-page-width={width}
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          width === 'narrow' && 'max-w-thread mx-auto w-full',
          !fitted && 'pb-[var(--page-end-space)]',
        )}
      >
        <Masthead
          title={resolved}
          crumb={crumb}
          lead={
            <>
              {shell?.sidebarToggle}
              {navDrawer ? (
                <NavMenuButton expanded={navDrawer.open} onOpen={navDrawer.onOpen} />
              ) : null}
              {back ? (
                <MastheadBack href={back.href} label={back.label} projectId={back.projectId} />
              ) : null}
            </>
          }
          search={shell?.searchTrigger}
          actions={actions}
          end={shell?.agentTrigger}
        />
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
        <div data-page-body="" className="flex min-w-0 flex-1 flex-col pt-[var(--page-pad-block)]">
          {children}
        </div>
      </div>
    </PageEmptyOfferProvider>
  );
}

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
