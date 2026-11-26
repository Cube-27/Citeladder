import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

const BAR_CLEARANCE = 'calc(var(--spacing-filter-bar) + 2 * var(--spacing-gutter))';

export function RecordPage({
  busy,
  identity,
  aside,
  actionBar,
  children,
  ...slots
}: PageFrameSlots &
  Readonly<{
    busy?: boolean;
    identity?: ReactNode;
    aside?: ReactNode;
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
            <div className="column-split:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-section grid min-w-0 items-start">
              <PageSections>{children}</PageSections>
              <aside className="gap-section flex min-w-0 flex-col">{aside}</aside>
            </div>
          ) : (
            children
          )}
        </PageSections>
      </div>
      {actionBar ? (
        <div
          data-page-band="action-bar"
          className="bg-raised border-rule rounded-card shadow-pop z-sticky bottom-gutter mt-workspace min-h-filter-bar px-card sticky flex min-w-0 flex-nowrap items-center justify-end gap-2 border py-2"
        >
          {actionBar}
        </div>
      ) : null}
    </PageFrame>
  );
}
