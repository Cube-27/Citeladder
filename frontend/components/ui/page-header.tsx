import type { ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';

/**
 * PageHeader — the top of every app page: the page name in `display-md`,
 * an optional sentence saying what the page shows, and the page's actions on
 * the right (secondary first, then the one primary). A detail page leads the
 * title with its way back.
 *
 * The title row is one control tall whatever it holds, so a page with
 * actions and a page without start their next band on the same line; only
 * where the actions cannot fit beside the title (a phone) do they take a
 * second row. The title stays one line: a long name truncates, the full
 * name in its tooltip.
 */
export function PageHeader({
  title,
  lead,
  description,
  actions,
}: Readonly<{
  title: string;
  /** Before the title: a detail page's back button. */
  lead?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <header data-page-header="" className="flex min-w-0 flex-col gap-1">
      <div className="flex min-h-[var(--control-md)] min-w-0 flex-wrap items-center justify-between gap-x-[var(--card-padding)] gap-y-2">
        <div className="flex min-w-[min(100%,12rem)] flex-1 items-center gap-3">
          {lead}
          <h1 className={textRole('pageTitle', 'min-w-0 truncate')} title={title}>
            {title}
          </h1>
        </div>
        {actions ? (
          <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {description ? <p className={textRole('body', 'max-w-prose')}>{description}</p> : null}
    </header>
  );
}
