import type { ReactNode } from 'react';

import { PageFrame, type PageFrameSlots } from './page-frame';

/**
 * Workbench (brand direction 3.4): the masthead, then the editor workspace
 * filling the window below it, so the window never scrolls and each pane
 * scrolls in itself. The workbench organisms (`components/ui/editor-workspace`)
 * draw the panes: the editor beside a side rail of tabs with the chat docked
 * in it, or, narrow, all of them as tabs over one pane. Their tab state
 * belongs to the route, which moves between them (Ask AI opens the chat).
 */
export function WorkbenchPage({
  children,
  ...slots
}: Omit<PageFrameSlots, 'tabs' | 'filters'> & Readonly<{ children: ReactNode }>) {
  return <PageFrame {...slots}>{children}</PageFrame>;
}
