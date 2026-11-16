import type { ReactNode } from 'react';

import { POP_FACE } from '@/components/ui/slip';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * What is selected and what can be done to it, in a bar held over the bottom
 * of the column: the dock takes no height in the page, so a selection
 * appearing or clearing moves nothing.
 */
export function SelectionDock({
  label,
  summary,
  children,
}: Readonly<{
  label: string;
  /** "N selected"; the bar shows only while there is one. */
  summary: string | null;
  children: ReactNode;
}>) {
  return (
    <div className="pointer-events-none sticky bottom-5 z-10 h-0">
      {summary === null ? null : (
        <div
          role="toolbar"
          aria-label={label}
          className={cn(
            POP_FACE,
            'pointer-events-auto absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-1 p-2',
          )}
        >
          <span className={textRole('body', 'px-2 whitespace-nowrap tabular-nums')}>{summary}</span>
          {children}
        </div>
      )}
    </div>
  );
}
