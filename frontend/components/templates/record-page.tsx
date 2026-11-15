import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageBack, type PageFrameSlots } from './page-frame';

/**
 * Record: the masthead with the back link and the record's own name, the
 * identity card (its facts and status), the cards, with an optional aside
 * beside them from a split-width column, and an optional action bar: a
 * `raised` bar with `shadow-pop` at the foot of the main column, one row at
 * every width (the caller folds lower-priority actions into a "More" menu),
 * the primary last. It sits in the flow under the cards, so the page reserves
 * its height and it never covers the last card; on a short record the body
 * grows and the bar stays at the window's foot rather than mid-page.
 */
export function RecordPage({
  busy,
  identity,
  aside,
  actionBar,
  children,
  ...slots
}: Omit<PageFrameSlots, 'back'> &
  Readonly<{
    back: PageBack;
    /** True while the record refetches: marks the body `aria-busy`. */
    busy?: boolean;
    /** The record's FactList and StatusMark, full width above the sections. */
    identity?: ReactNode;
    /** Supporting context beside the sections. */
    aside?: ReactNode;
    /** The record's decisions, sticky at the window's foot. */
    actionBar?: ReactNode;
    children: ReactNode;
  }>) {
  return (
    <PageFrame {...slots}>
      <div aria-busy={busy} className="flex min-w-0 flex-1 flex-col">
        <PageSections>
          {identity}
          {aside ? (
            <div className="column-split:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid min-w-0 items-start gap-[var(--workspace-gap)]">
              <PageSections>{children}</PageSections>
              <aside
                data-rhythm-gap="workspace"
                className="flex min-w-0 flex-col gap-[var(--workspace-gap)]"
              >
                {aside}
              </aside>
            </div>
          ) : (
            children
          )}
        </PageSections>
      </div>
      {actionBar ? (
        <div
          data-page-band="action-bar"
          className="bg-raised border-rule rounded-card shadow-pop z-sticky sticky bottom-[var(--content-gutter)] mt-[var(--workspace-gap)] flex min-h-[var(--filter-bar-height)] min-w-0 flex-nowrap items-center justify-end gap-2 border px-[var(--card-padding)] py-2"
        >
          {actionBar}
        </div>
      ) : null}
    </PageFrame>
  );
}
