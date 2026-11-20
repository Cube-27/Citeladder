import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/** The action bar's height and a gutter above and below it. */
const BAR_CLEARANCE = 'calc(var(--filter-bar-height) + 2 * var(--content-gutter))';

/**
 * Record: the masthead's trail to its collection, the record's name as the
 * h1, the identity card (its facts and status), the cards, with an optional
 * aside beside them from a split-width column, and an optional action bar: a
 * `raised` bar with `shadow-pop` at the foot of the main column, one row at
 * every width (the caller folds lower-priority actions into a "More" menu),
 * the primary last. It sits in the flow under the cards and sticks to the
 * panel's foot. While it shows, the panel's scroll padding (globals.css) and
 * the body's foot clear it, so focus and the last card never sit under it
 * (WCAG 2.4.11).
 */
export function RecordPage({
  busy,
  identity,
  aside,
  actionBar,
  children,
  ...slots
}: PageFrameSlots &
  Readonly<{
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
  const hasBar = Boolean(actionBar);
  return (
    <PageFrame {...slots}>
      <div
        aria-busy={busy}
        className="flex min-w-0 flex-1 flex-col"
        style={hasBar ? { paddingBottom: BAR_CLEARANCE } : undefined}
      >
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
