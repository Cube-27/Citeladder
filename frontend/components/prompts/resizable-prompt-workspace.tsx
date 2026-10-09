'use client';

import type { ReactNode } from 'react';

import { ResizableSplitPane } from '@/components/ui/split-pane';

/** The Prompts topic rail beside the library: the shared resizable split at the rail's widths. */
export function ResizablePromptWorkspace({
  rail,
  children,
  railId,
}: Readonly<{ rail: ReactNode; children: ReactNode; railId: string }>) {
  return (
    <ResizableSplitPane
      list={rail}
      listId={railId}
      separatorLabel="Resize topics panel"
      defaultWidth={240}
      minWidth={208}
      maxWidth={400}
      minDetailWidth={572}
      stickyList
    >
      {children}
    </ResizableSplitPane>
  );
}
