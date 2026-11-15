import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Collection: the masthead with the one primary
 * action, the view switch and filter bar, then one DataTable or a grid of
 * slips (`children`) and its pager under it.
 */
export function CollectionPage({
  pager,
  children,
  ...slots
}: PageFrameSlots & Readonly<{ pager?: ReactNode; children: ReactNode }>) {
  return (
    <PageFrame {...slots}>
      <PageSections>
        {children}
        {pager}
      </PageSections>
    </PageFrame>
  );
}
