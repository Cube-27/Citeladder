import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageBack, type PageFrameSlots } from './page-frame';

/**
 * Record: the masthead with the back link and the
 * record's own name, the identity strip (its facts and status), the
 * sections, with an optional aside beside them from a split-width column,
 * and an optional action bar that stays at the window's foot.
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
      <div aria-busy={busy} className="flex min-w-0 flex-col">
        <PageSections>
          {identity}
          {aside ? (
            <div className="column-split:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid min-w-0 items-start gap-x-[var(--workspace-gap)] gap-y-[var(--page-section-gap)]">
              <PageSections>{children}</PageSections>
              <aside
                data-rhythm-gap=""
                className="flex min-w-0 flex-col gap-[var(--page-section-gap)] *:[--rhythm-gap:var(--page-section-gap)]"
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
          className="bg-ground border-rule z-sticky sticky bottom-0 -mx-[var(--content-gutter)] mt-[var(--page-section-gap)] flex min-h-[var(--filter-bar-height)] flex-wrap items-center justify-end gap-2 border-t px-[var(--content-gutter)] py-2"
        >
          {actionBar}
        </div>
      ) : null}
    </PageFrame>
  );
}
