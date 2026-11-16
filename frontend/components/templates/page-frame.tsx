import { useContext, useLayoutEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { PageTitleContext } from '@/components/layout/page-title-context';
import { ShellContext } from '@/components/layout/shell-context';
import { NavMenuButton } from '@/components/ui/app-shell';
import { Masthead, MastheadBack } from '@/components/ui/masthead';
import { PageEmptyOfferProvider } from '@/components/ui/masthead-actions';
import { resolveTitle } from '@/lib/navigation/app-routes';
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
  /** The masthead's own actions: secondary first, then at most one primary. */
  actions?: ReactNode;
  /** The page tabs (40): the page's sub-views. */
  tabs?: ReactNode;
  /** The filter bar (48): search, filters and view switch; count and export. */
  filters?: ReactNode;
}>;

/**
 * The anatomy every shell page shares: the masthead, then the optional page
 * tabs, the filter row 24 below them (or the masthead), then the body: 12
 * under the filter row, else 24 under the tabs or masthead. The masthead's
 * menu button, search and "Ask agent" come from the shell; `end` replaces
 * "Ask agent" (the Agent's History button). Geometry is tokens only; a page
 * passes content into the slots and sets none of its own.
 */
export function PageFrame({
  title,
  back,
  actions,
  tabs,
  filters,
  end,
  children,
}: PageFrameSlots & Readonly<{ end?: ReactNode; children: ReactNode }>) {
  const resolved = useRouteTitle(title);
  const shell = useContext(ShellContext);
  const navDrawer = shell?.navDrawer;
  return (
    <PageEmptyOfferProvider>
      <div className="flex min-w-0 flex-1 flex-col">
        <Masthead
          title={resolved}
          lead={
            <>
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
          end={end ?? shell?.agentTrigger}
        />
        {tabs ? (
          <div
            data-page-band="tabs"
            className="flex min-h-[var(--page-tabs-height)] min-w-0 items-end overflow-x-auto"
          >
            {tabs}
          </div>
        ) : null}
        {filters ? (
          <div
            data-page-band="filters"
            className="flex min-w-0 items-center pt-[var(--page-top-gap)]"
          >
            {filters}
          </div>
        ) : null}
        <div
          data-page-body=""
          className={cn(
            'flex min-w-0 flex-1 flex-col',
            filters ? 'pt-[var(--filter-row-gap)]' : 'pt-[var(--page-top-gap)]',
          )}
        >
          {children}
        </div>
      </div>
    </PageEmptyOfferProvider>
  );
}

/** The body's cards, 16 apart (a titled group adds its own 32), on the one left edge. */
export function PageSections({
  className,
  children,
}: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <div
      data-page-content=""
      data-rhythm-gap="workspace"
      className={cn('flex min-w-0 flex-col gap-[var(--workspace-gap)]', className)}
    >
      {children}
    </div>
  );
}

/** The route's title, announced by the shell when a page overrides it. */
function useRouteTitle(title: string | undefined) {
  const pathname = useLocation().pathname ?? '';
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
